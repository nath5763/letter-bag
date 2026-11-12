import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, context, redis, reddit } from '@devvit/web/server';
import { telemetry } from '@devvit/analytics/server/reddit';
import { createGame, finish, publicGame, submitWord, timeLeft } from '../shared/engine.js';
import { storedJson } from './stored-json.js';
import { currentStreak, nextProfile } from './streak.js';

const app = new Hono();
type Game = ReturnType<typeof createGame>;
type Profile = { lastDay: string; current: number; best: number };
type PostRecord = { status: 'creating'; token: string; claimedAt: number } | { status: 'published'; postId: string };
const utcDay = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);
const datedPost = () => {
  const day = (context.postData as { day?: unknown } | undefined)?.day;
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
};
const attemptKey = (day: string) => `attempt:${day}:${context.userId}`;
const postKey = (day: string) => `daily-post:${day}`;
const profileKey = (userId: string) => `profile:${userId}`;
const completionKey = (day: string, userId: string) => `completion:${day}:${userId}`;
const dailyKey = (day: string) => `leaderboard:daily:${day}`;
const allTimeKey = 'leaderboard:all-time';
const activeKey = 'rounds:active';
const activeMember = (day: string, userId: string) => `${day}:${userId}`;
const visible = (game: Game) => publicGame(game);
const closed = (day: string | null) => day !== utcDay();

async function load(day: string | null) {
  if (!context.userId || !day) return null;
  const raw = await redis.get(attemptKey(day));
  return storedJson(raw) as Game | null;
}

async function playerProfile(day: string) {
  if (!context.userId) return null;
  const profile = storedJson(await redis.get(profileKey(context.userId))) as Profile | null;
  return { current: currentStreak(profile, day), best: profile?.best || 0 };
}

async function commitResult(day: string, userId: string, current: Game | null, next: Game) {
  const key = `attempt:${day}:${userId}`;
  const marker = completionKey(day, userId);
  const profileId = profileKey(userId);
  for (let retry = 0; retry < 6; retry++) {
    const tx = await redis.watch(key, marker, profileId);
    const [rawGame, rawMarker, rawProfile] = await Promise.all([redis.get(key), redis.get(marker), redis.get(profileId)]);
    if (JSON.stringify(storedJson(rawGame)) !== JSON.stringify(current)) { await tx.unwatch(); return false; }
    const profile = storedJson(rawProfile) as Profile | null;
    const qualifies = next.endedAt !== null && next.words.length > 0 && !rawMarker;
    await tx.multi();
    await tx.set(key, JSON.stringify(next));
    if (next.endedAt !== null) await tx.zRem(activeKey, [activeMember(day, userId)]);
    else if (current === null && next.startedAt !== null)
      await tx.zAdd(activeKey, { member: activeMember(day, userId), score: next.startedAt + next.config.seconds * 1000 });
    if (qualifies) {
      await tx.set(marker, String(next.score));
      await tx.set(profileId, JSON.stringify(nextProfile(profile, day) satisfies Profile));
      await tx.zAdd(dailyKey(day), { member: userId, score: next.score });
      await tx.zIncrBy(allTimeKey, userId, next.score);
      await tx.expire(dailyKey(day), 90 * 86400);
    }
    if (await tx.exec() !== null) return true;
  }
  return false;
}

async function change(day: string | null, transform: (game: Game | null) => { game: Game; error?: string | null }) {
  if (!day) return { status: 400, body: { error: 'This post has no puzzle date' } };
  if (!context.userId) return { status: 403, body: { error: 'Sign in to record a daily attempt' } };
  const key = attemptKey(day);
  for (let retry = 0; retry < 4; retry++) {
    const tx = await redis.watch(key);
    const raw = await redis.get(key);
    const current = storedJson(raw) as Game | null;
    const expired = current?.startedAt !== null && current?.startedAt !== undefined && timeLeft(current) === 0 && current.endedAt === null;
    if (expired) {
      await tx.unwatch();
      if (!await commitResult(day, context.userId, current, finish(current))) continue;
      continue;
    }
    const result = transform(current);
    if (result.error) {
      await tx.unwatch();
      return { status: 400, body: { game: visible(result.game), error: result.error } };
    }
    await tx.unwatch();
    if (await commitResult(day, context.userId, current, result.game)) return { status: 200, body: { game: visible(result.game), error: null } };
  }
  return { status: 409, body: { error: 'Round changed; try again' } };
}

async function findPublishedPost(day: string, subredditName: string) {
  const title = `Daily Letter Bag · ${day}`;
  const recent = await reddit.getNewPosts({ subredditName, limit: 100 }).all();
  const matches = recent.filter(post => post.title === title);
  for (const post of matches) {
    if ((await post.getPostData())?.day === day) return post.id;
  }
  return null;
}

async function currentSubredditName() {
  if (context.subredditName) return context.subredditName;
  if (context.subredditId) {
    const subreddit = await reddit.getSubredditInfoById(context.subredditId);
    if (subreddit.name) return subreddit.name.replace(/^r\//, '');
  }
  throw Error('Subreddit context is required for daily posting');
}

async function ensureTodayPost() {
  const day = utcDay();
  const subredditName = await currentSubredditName();
  const key = postKey(day);
  const token = `${Date.now()}:${Math.random()}`;
  for (let retry = 0; retry < 4; retry++) {
    const tx = await redis.watch(key);
    const raw = await redis.get(key);
    const record = storedJson(raw) as PostRecord | null;
    if (record?.status === 'published') { await tx.unwatch(); return record.postId; }
    if (record?.status === 'creating' && Date.now() - record.claimedAt < 5 * 60_000) {
      await tx.unwatch();
      return null;
    }
    await tx.multi();
    await tx.set(key, JSON.stringify({ status: 'creating', token, claimedAt: Date.now() } satisfies PostRecord));
    if (await tx.exec() !== null) {
      // Reconcile a post whose creation succeeded but whose Redis write did not.
      let postId = record?.status === 'creating' ? await findPublishedPost(day, subredditName) : null;
      if (!postId) {
        const post = await reddit.submitCustomPost({
          subredditName, title: `Daily Letter Bag · ${day}`, postData: { day }, entry: 'default'
        });
        postId = post.id;
      }
      const save = await redis.watch(key);
      const claim = storedJson(await redis.get(key)) as PostRecord | null;
      if (claim?.status !== 'creating' || claim.token !== token) {
        await save.unwatch();
        throw Error(`Lost daily post claim for ${day}; post ${postId} needs reconciliation`);
      }
      await save.multi();
      await save.set(key, JSON.stringify({ status: 'published', postId } satisfies PostRecord));
      if (await save.exec() === null) throw Error(`Could not save daily post ${postId}`);
      console.log(`Published daily puzzle ${day}: ${postId}`);
      return postId;
    }
  }
  throw Error(`Could not claim daily post for ${day}`);
}

app.get('/api/state', async c => {
  const day = datedPost();
  let game = await load(day) || createGame(day || utcDay());
  if (day && game.startedAt !== null && game.endedAt === null && timeLeft(game) === 0 && context.userId) {
    await commitResult(day, context.userId, game, finish(game));
    game = await load(day) || game;
  }
  const postUrl = context.postId && context.subredditName
    ? `https://www.reddit.com/r/${context.subredditName}/comments/${context.postId.replace(/^t3_/, '')}/`
    : '';
  return c.json({ game: visible(game), anonymous: !context.userId, closed: closed(day), postUrl, profile: await playerProfile(day || utcDay()) });
});

app.get('/api/leaderboard', async c => {
  const day = datedPost() || utcDay();
  const boards = await Promise.all([redis.zRange(dailyKey(day), 0, 9, { by: 'rank', reverse: true }), redis.zRange(allTimeKey, 0, 9, { by: 'rank', reverse: true })]);
  const names = new Map<string, string>();
  await Promise.all([...new Set(boards.flat().map(entry => entry.member))].map(async id => {
    try { names.set(id, (await reddit.getUserById(id as `t2_${string}`))?.username || 'Reddit player'); }
    catch { names.set(id, 'Reddit player'); }
  }));
  const rows = (board: typeof boards[number]) => board.map((entry, index) => ({ rank: index + 1, name: names.get(entry.member), score: entry.score }));
  return c.json({ day, daily: rows(boards[0]), allTime: rows(boards[1]) });
});

// The analytics package's supplied router is Express-only; these Hono routes
// expose the same client endpoints while keeping this server's Hono adapter.
app.post('/api/telemetry/journey/app-ready', async c => c.json(await telemetry.appReady()));
app.post('/api/telemetry/journey/start', async c => c.json(await telemetry.startJourney()));
app.post('/api/telemetry/journey/progress', async c => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.journeyId !== 'string' || typeof body.progress !== 'number' || body.progress < 0 || body.progress > 1)
    return c.json({ error: 'Invalid progress event' }, 400);
  return c.json(await telemetry.journeyProgress({ journeyId: body.journeyId, progress: body.progress, action: String(body.action || ''), actionDetails: '' }));
});
app.post('/api/telemetry/journey/interaction', async c => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.journeyId !== 'string' || typeof body.action !== 'string') return c.json({ error: 'Invalid interaction event' }, 400);
  return c.json(await telemetry.journeyInteraction({ journeyId: body.journeyId, action: body.action, actionDetails: '' }));
});
app.post('/api/telemetry/journey/end', async c => {
  const body = await c.req.json().catch(() => ({}));
  const game = await load(datedPost());
  if (typeof body.journeyId !== 'string' || !game || game.endedAt === null) return c.json({ error: 'Round has not ended' }, 400);
  return c.json(await telemetry.endJourney({ journeyId: body.journeyId, complete: true, game: { win: game.words.length > 0, score: game.score } }));
});

app.post('/api/start', async c => {
  const day = datedPost();
  if (closed(day)) return c.json({ error: 'This daily puzzle is closed' }, 400);
  const result = await change(day, current => {
    const now = Date.now();
    if (utcDay(now) !== day) return { game: current || createGame(day!), error: 'This daily puzzle is closed' };
    return current ? { game: current, error: 'Today’s attempt has already started' } : { game: createGame(day!, {}, now) };
  });
  return c.json(result.body, result.status as 200);
});

app.post('/api/submit', async c => {
  const day = datedPost();
  const body = await c.req.json().catch(() => ({}));
  const result = await change(day, current => {
    if (!current) return { game: createGame(day!), error: 'Start the round first' };
    // A round started before midnight may finish within its original time limit.
    if (utcDay(current.startedAt!) !== day) return { game: current, error: 'This daily puzzle is closed' };
    return submitWord(current, body.ids, Date.now());
  });
  return c.json(result.body, result.status as 200);
});

app.post('/api/finish', async c => {
  const day = datedPost();
  const result = await change(day, current => {
    if (!current) return { game: createGame(day!), error: 'Start the round first' };
    return { game: finish(current) };
  });
  return c.json(result.body, result.status as 200);
});

app.post('/internal/scheduler/daily-post', async c => {
  try { await ensureTodayPost(); await reconcileExpiredRounds(); return c.json({ status: 'ok' }); }
  catch (error) { console.error('Daily post check failed', error); return c.json({ status: 'error' }, 500); }
});

async function reconcileExpiredRounds() {
  const due = await redis.zRange(activeKey, '-inf', Date.now(), { by: 'score', limit: { offset: 0, count: 100 } });
  for (const entry of due) {
    try {
      const day = entry.member.slice(0, 10);
      const userId = entry.member.slice(11);
      const game = storedJson(await redis.get(`attempt:${day}:${userId}`)) as Game | null;
      if (!game || game.endedAt !== null) { await redis.zRem(activeKey, [entry.member]); continue; }
      await commitResult(day, userId, game, finish(game));
    } catch (error) { console.error('Could not reconcile expired round', error); }
  }
}

app.post('/internal/triggers/app-install', async c => {
  try { await ensureTodayPost(); }
  catch (error) { console.error('Daily post after install/upgrade failed; scheduler will retry', error); }
  return c.json({ status: 'ok' });
});

app.post('/internal/menu/post-create', async c => {
  try {
    const postId = await ensureTodayPost();
    if (!postId) return c.json({ showToast: 'Today’s post is being created. Try again shortly.' });
    return c.json({ navigateTo: `https://reddit.com/r/${await currentSubredditName()}/comments/${postId.replace(/^t3_/, '')}` });
  } catch (error) {
    console.error('Moderator daily post action failed', error);
    return c.json({ showToast: 'Could not create today’s post. Check the playtest logs.' });
  }
});

serve({ fetch: app.fetch, createServer, port: getServerPort() });

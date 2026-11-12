import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, context, redis, reddit } from '@devvit/web/server';
import { createGame, finish, publicGame, submitWord, timeLeft } from '../shared/engine.js';
import { storedJson } from './stored-json.js';

const app = new Hono();
type Game = ReturnType<typeof createGame>;
type PostRecord = { status: 'creating'; token: string; claimedAt: number } | { status: 'published'; postId: string };
const utcDay = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);
const datedPost = () => {
  const day = (context.postData as { day?: unknown } | undefined)?.day;
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
};
const attemptKey = (day: string) => `attempt:${day}:${context.userId}`;
const postKey = (day: string) => `daily-post:${day}`;
const visible = (game: Game) => publicGame(game);
const closed = (day: string | null) => day !== utcDay();

async function load(day: string | null) {
  if (!context.userId || !day) return null;
  const raw = await redis.get(attemptKey(day));
  return storedJson(raw) as Game | null;
}

async function change(day: string | null, transform: (game: Game | null) => { game: Game; error?: string | null }) {
  if (!day) return { status: 400, body: { error: 'This post has no puzzle date' } };
  if (!context.userId) return { status: 403, body: { error: 'Sign in to record a daily attempt' } };
  const key = attemptKey(day);
  for (let retry = 0; retry < 4; retry++) {
    const tx = await redis.watch(key);
    const raw = await redis.get(key);
    const current = storedJson(raw) as Game | null;
    const result = transform(current);
    if (result.error) {
      await tx.unwatch();
      return { status: 400, body: { game: visible(result.game), error: result.error } };
    }
    await tx.multi();
    await tx.set(key, JSON.stringify(result.game));
    const committed = await tx.exec();
    if (committed !== null) return { status: 200, body: { game: visible(result.game), error: null } };
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
  const game = await load(day) || createGame(day || utcDay());
  const postUrl = context.postId && context.subredditName
    ? `https://www.reddit.com/r/${context.subredditName}/comments/${context.postId.replace(/^t3_/, '')}/`
    : '';
  return c.json({ game: visible(game), anonymous: !context.userId, closed: closed(day), postUrl });
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
    if (closed(day) && timeLeft(current) === 0) return { game: current, error: 'This daily puzzle is closed' };
    return { game: finish(current) };
  });
  return c.json(result.body, result.status as 200);
});

app.post('/internal/scheduler/daily-post', async c => {
  try { await ensureTodayPost(); return c.json({ status: 'ok' }); }
  catch (error) { console.error('Daily post check failed', error); return c.json({ status: 'error' }, 500); }
});

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

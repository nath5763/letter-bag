import { createGame, finish, letterBonus, publicGame, scoreWord, submitWord } from '../shared/engine.js';
import { resultCard } from '../shared/result.js';
import { api } from './api.js';
import { telemetry } from '@devvit/analytics/client/reddit';

const practice = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
const app = document.getElementById('app');
let game;
let config;
let seed;
let selected = [];
let busy = false;
let message = '';
let anonymous = false;
let closed = false;
let postUrl = '';
let infoOpen = false;
let arrivingTiles = new Set();
let profile = null;
let leaderboard = null;
let leaderboardOpen = false;
const localRound = () => practice || anonymous;
const tileFace = letter => `${letter}${letterBonus(letter) ? `<span class="tile-bonus" aria-hidden="true">${letterBonus(letter)}</span>` : ''}`;
const wordPoints = () => scoreWord(selected.map(id => game.rack.find(tile => tile.id === id)?.letter || '').join(''));
const pointsLabel = () => selected.length >= 3 ? `+${wordPoints().points} POINTS` : '3 LETTERS MINIMUM';
async function track(call) {
  if (localRound()) return;
  try {
    const response = await call();
    if (response?.receipt && !['JOURNEY_RECEIPT_VALID', 'JOURNEY_RECEIPT_REUSED'].includes(response.receipt.status))
      console.info('Journey receipt:', response.receipt.status, response.receipt.message);
  } catch (error) { console.warn('Journey telemetry failed', error); }
}
async function reportEnd() {
  if (!localRound() && game?.endedAt !== null && telemetry.getActiveJourneyId())
    await track(() => telemetry.endJourney());
}
async function refreshProfile() {
  if (!localRound()) profile = (await api('state')).profile;
}

async function init() {
  try {
    if (practice) {
      const settings = await fetch('/practice-config.json').then(r => r.json());
      config = settings.config;
      seed = settings.seed;
      game = createGame(seed, config);
    } else {
      const data = await api('state');
      anonymous = data.anonymous;
      closed = data.closed;
      postUrl = data.postUrl || '';
      profile = data.profile;
      game = anonymous ? createGame(data.game.seed) : data.game;
    }
    render();
    if (!practice) await track(() => telemetry.appReady());
    await reportEnd();
  } catch (error) { app.innerHTML = `<div class="error-card"><h1>Bag unavailable</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Try again</button></div>`; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function view() { return localRound() ? publicGame(game) : game; }

function render() {
  const state = view();
  const started = state.startedAt !== null;
  const ended = state.endedAt !== null;
  const active = started && !ended;
  const unavailable = !practice && !started && (closed || game.seed !== new Date().toISOString().slice(0, 10));
  const result = ended ? resultCard(game, { practice, anonymous, postUrl }) : null;
  const wordTiles = selected.map(id => {
    const letter = game.rack.find(tile => tile.id === id)?.letter || '';
    return `<button type="button" class="chosen" data-remove="${id}" aria-label="Remove ${letter} from word">${tileFace(letter)}</button>`;
  }).join('');
  app.innerHTML = `
    <header class="topline"><span class="brand">DAILY LETTER BAG</span><div class="top-actions"><span class="mode">${practice ? 'PRACTICE' : `GAME #${escapeHtml(game.seed.replaceAll('-', ''))}`}</span>${!started ? '<button type="button" class="info-button" id="info" aria-haspopup="dialog">How to play</button>' : ''}</div></header>
    <section class="dashboard"><div><span class="label">SCORE</span><strong>${state.score}</strong></div><div><span class="label">BAG</span><strong>${state.bagRemaining}</strong></div></section>
    <section class="tabletop">
    ${ended ? `<section class="result-stage"><div class="result-card" aria-label="${escapeHtml(result.label)}"><div class="result-card-top"><span class="label">${escapeHtml(result.label)}</span><span class="result-number">${result.gameNumber ? `GAME #${result.gameNumber}` : 'PRACTICE'}</span></div><strong>${state.score}</strong><span class="result-score-label">POINTS</span><div class="result-stats"><div><b>${result.wordCount}</b><span>WORDS</span></div><div><b>${result.longest}</b><span>LONGEST WORD</span></div></div><p>Copy this summary without revealing any letters or words.</p><div class="result-actions"><button type="button" class="primary" id="copy-result">Copy result</button></div></div>${state.words.length ? `<section class="history"><div class="section-head"><span>WORDS PLAYED</span><span>${state.words.length}</span></div><div class="word-list">${[...state.words].reverse().map(entry => `<div><span>${escapeHtml(entry.word)}</span><b>+${entry.points}${entry.bonusPoints ? ` <small>(${entry.basePoints} base + ${entry.bonusPoints} bonus)</small>` : ''}</b></div>`).join('')}</div></section>` : ''}</section>` : `
    <div class="bag-row"><div class="bag-scene" aria-hidden="true"><div class="draw-bag"></div></div><section class="preview-area"><div class="section-head"><span>UP NEXT</span></div><div class="preview">${state.bag.map(tile => `<span class="preview-tile ${!started ? 'masked' : ''}">${started ? tileFace(tile.letter) : '?'}</span>`).join('') || '<span class="empty">The bag is empty</span>'}</div></section></div>
      ${active ? `<section class="compose"><div class="section-head"><span>YOUR WORD</span><span id="word-points">${pointsLabel()}</span></div><div class="word-controls"><div class="wordline">${wordTiles || '<span>Tap letters to form a word</span>'}</div><button type="button" class="back-button" id="back" ${!selected.length ? 'disabled' : ''} aria-label="Remove last letter">&larr; Back</button></div></section>` : '<section class="opening-copy"><div class="section-head"><span>YOUR WORD</span></div><p>Make words from your 30 letters. There is no time limit.</p></section>'}
      <section class="play-area"><div class="section-head"><span>YOUR LETTERS</span><span>${game.rack.length} AVAILABLE</span></div><div class="rack">${game.rack.map((tile, index) => `<button type="button" class="tile ${!started ? 'masked' : ''} ${selected.includes(tile.id) ? 'picked' : ''} ${arrivingTiles.has(tile.id) ? 'drawn' : ''}" style="--draw-index:${index}" data-tile="${tile.id}" ${!active || selected.includes(tile.id) ? 'disabled' : ''} aria-label="${started ? `Letter ${tile.letter}${letterBonus(tile.letter) ? `, ${letterBonus(tile.letter)} bonus points` : ''}` : 'Hidden letter'}">${started ? tileFace(tile.letter) : '?'}</button>`).join('')}</div></section>
    <section class="round-actions"><div class="actions">${!started ? unavailable ? '<div class="end-card"><span class="label">PUZZLE CLOSED</span><p>This daily puzzle is closed. Open today\'s post to play.</p></div>' : '<button type="button" class="primary" id="start">Start</button>' : `<button type="button" class="primary" id="submit" ${selected.length < 3 || busy ? 'disabled' : ''}>Play word</button><button type="button" class="secondary" id="clear" ${!selected.length ? 'disabled' : ''}>Clear</button><button type="button" class="text-button" id="finish">Finish</button>`}</div></section>`}
    <div class="feedback" role="status">${escapeHtml(message)}</div>
    </section>
    ${practice && !active ? `<footer class="practice-tools"><button id="replay">Replay seed</button><button id="new">New puzzle</button><span>Local practice &middot; unlimited attempts</span></footer>` : ''}
    ${infoOpen && !started ? `<div class="info-backdrop" id="info-backdrop"><section class="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-title"><button type="button" class="info-close" id="info-close" aria-label="Close instructions">&times;</button><span class="label">HOW TO PLAY</span><h2 id="info-title">Daily Letter Bag</h2><ul><li>You have 30 letters. Start with 15 in your rack; used letters are replaced from the bag in order.</li><li>The next five letters are visible, so you can plan ahead.</li><li>Tap at least 3 wooden letters to form a word, then tap Play word.</li><li>Longer words earn progressively more points: 1 plus 1, 2, 3, and so on. A 3-letter word earns 7 base points.</li><li>Rare letters add bonus points for each tile: Q and Z earn 2; J, X, K, and V earn 1.</li><li>There is no time limit. Earn the highest possible score from your available letters, then choose Finish.</li><li>A word can score once per round. Invalid words do not use letters.</li>${practice ? '' : '<li>Signed-in players get one scored attempt per UTC day.</li>'}</ul><button type="button" class="primary" id="info-done">Got it</button></section></div>` : ''}`;
  if (!started && profile) app.querySelector('.opening-copy')?.insertAdjacentHTML('beforeend', `<p class="streak-note">Current streak: ${profile.current} ${profile.current === 1 ? 'day' : 'days'} · Best: ${profile.best}</p>`);
  if (infoOpen && !practice) app.querySelector('.info-dialog ul')?.insertAdjacentHTML('beforeend', '<li>Finish a signed-in daily round with at least one valid word to grow your UTC-day streak and enter the community leaderboards.</li>');
  if (ended && !localRound()) app.querySelector('.result-actions')?.insertAdjacentHTML('beforeend', '<button type="button" class="secondary" id="leaderboard">Leaderboards</button>');
  if (leaderboardOpen) app.insertAdjacentHTML('beforeend', `<div class="info-backdrop" id="leaderboard-backdrop"><section class="info-dialog leaderboard-dialog" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title"><button type="button" class="info-close" id="leaderboard-close" aria-label="Close leaderboards">&times;</button><span class="label">COMMUNITY STANDINGS</span><h2 id="leaderboard-title">Leaderboards</h2>${leaderboard ? `<h3>Today · ${escapeHtml(leaderboard.day)}</h3><p>Highest points first; fewer words break a points tie.</p>${boardHtml(leaderboard.daily, true)}<h3>All time · total points</h3>${boardHtml(leaderboard.allTime)}` : '<p>Loading standings…</p>'}</section></div>`);
  arrivingTiles = new Set();
  bind();
  if (infoOpen && !started) app.querySelector('#info-close')?.focus();
}

function boardHtml(rows, showWords = false) {
  return rows.length ? `<ol class="leaderboard-list">${rows.map(row => `<li><span>${row.rank}. ${escapeHtml(row.name)}</span><b>${row.score}${showWords && row.wordCount !== undefined ? ` <small>(${row.wordCount} words)</small>` : ''}</b></li>`).join('')}</ol>` : '<p>No qualifying rounds yet.</p>';
}

function refreshSelection() {
  for (const button of app.querySelectorAll('[data-tile]')) {
    const picked = selected.includes(Number(button.dataset.tile));
    button.classList.toggle('picked', picked);
    button.disabled = picked || busy;
  }
  const wordline = app.querySelector('.wordline');
  wordline.innerHTML = selected.map(id => {
    const letter = game.rack.find(tile => tile.id === id)?.letter || '';
    return `<button type="button" class="chosen" data-remove="${id}" title="Tap to remove this letter" aria-label="Remove ${letter} from word">${tileFace(letter)}</button>`;
  }).join('') || '<span>Tap letters to form a word</span>';
  const length = selected.length;
  app.querySelector('#word-points').textContent = pointsLabel();
  app.querySelector('#back').disabled = !length || busy;
  app.querySelector('#clear').disabled = !length || busy;
  app.querySelector('#submit').disabled = length < 3 || busy;
  app.querySelector('.feedback').textContent = message;
}

async function copyResult(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* Try the selection fallback. */ }
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  return copied;
}

function resultFeedback(text) {
  message = text;
  const feedback = app.querySelector('.feedback');
  if (feedback) feedback.textContent = text;
}

function bind() {
  app.querySelector('#leaderboard')?.addEventListener('click', async () => {
    leaderboardOpen = true; leaderboard = null; render();
    try { leaderboard = await api('leaderboard'); }
    catch (error) { leaderboardOpen = false; message = error.message; }
    render();
  });
  app.querySelector('#leaderboard-close')?.addEventListener('click', () => { leaderboardOpen = false; render(); app.querySelector('#leaderboard')?.focus(); });
  app.querySelector('#leaderboard-backdrop')?.addEventListener('click', event => { if (event.target.id === 'leaderboard-backdrop') { leaderboardOpen = false; render(); } });
  app.querySelector('#info')?.addEventListener('click', () => { infoOpen = true; render(); });
  const closeInfo = () => { infoOpen = false; render(); app.querySelector('#info')?.focus(); };
  app.querySelector('#info-close')?.addEventListener('click', closeInfo);
  app.querySelector('#info-done')?.addEventListener('click', closeInfo);
  app.querySelector('#info-backdrop')?.addEventListener('click', event => {
    if (event.target.id === 'info-backdrop') closeInfo();
  });
  app.querySelector('#copy-result')?.addEventListener('click', async () => {
    const result = resultCard(game, { practice, anonymous, postUrl });
    try { resultFeedback(await copyResult(result.text) ? 'Result copied.' : 'Copy is unavailable on this device.'); }
    catch { resultFeedback('Copy is unavailable on this device.'); }
  });
  app.querySelector('.rack')?.addEventListener('click', event => {
    const button = event.target.closest('[data-tile]');
    if (!button || button.disabled) return;
    selected.push(Number(button.dataset.tile));
    message = '';
    refreshSelection();
  });
  app.querySelector('.wordline')?.addEventListener('click', event => {
    if (busy) return;
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    selected = selected.filter(id => id !== Number(button.dataset.remove));
    refreshSelection();
  });
  app.querySelector('#back')?.addEventListener('click', () => { selected = selected.slice(0, -1); refreshSelection(); });
  app.querySelector('#clear')?.addEventListener('click', () => { selected = []; refreshSelection(); });
  app.querySelector('#start')?.addEventListener('click', async () => {
    if (!practice && game.seed !== new Date().toISOString().slice(0, 10)) { closed = true; render(); return; }
    try { busy = true; if (localRound()) game = { ...game, startedAt: Date.now() }; else game = (await api('start')).game; arrivingTiles = new Set(game.rack.map(tile => tile.id)); selected = []; message = ''; render(); await track(() => telemetry.startJourney()); }
    catch (error) { message = error.message; render(); } finally { busy = false; }
  });
  app.querySelector('#submit')?.addEventListener('click', async () => {
    try {
      busy = true;
      refreshSelection();
      const previousBag = game.bag.length;
      const result = localRound() ? submitWord(game, selected) : await api('submit', { ids: selected });
      if (!result.error) arrivingTiles = new Set(result.game.rack.filter(tile => !game.rack.some(old => old.id === tile.id)).map(tile => tile.id));
      game = result.game;
      const played = result.game.words.at(-1);
      message = result.error || `${played.word.toUpperCase()} accepted: +${played.points} points${played.bonusPoints ? ` (${played.basePoints} base + ${played.bonusPoints} letter bonus)` : ''}.`;
      if (!result.error) {
        selected = [];
        render();
        if (result.game.words.length === 1) await track(() => telemetry.progress({ progress: .25, action: 'first_word' }));
        else await track(() => telemetry.interaction({ action: 'word_accepted' }));
        if (previousBag > 0 && result.game.bagRemaining === 0) await track(() => telemetry.progress({ progress: .75, action: 'bag_empty' }));
      } else render();
      if (game.endedAt !== null) { await reportEnd(); await refreshProfile(); render(); }
    } catch (error) { message = error.message; render(); } finally {
      busy = false;
      if (app.querySelector('#submit')) refreshSelection();
    }
  });
  app.querySelector('#finish')?.addEventListener('click', async () => {
    try { game = localRound() ? finish(game) : (await api('finish')).game; selected = []; message = ''; render(); await track(() => telemetry.interaction({ action: 'finish' })); await reportEnd(); await refreshProfile(); render(); }
    catch (error) { message = error.message; render(); }
  });
  app.querySelector('#replay')?.addEventListener('click', () => { game = createGame(seed, config); selected = []; message = ''; render(); });
  app.querySelector('#new')?.addEventListener('click', () => { seed = `practice-${Date.now()}`; game = createGame(seed, config); selected = []; message = ''; render(); });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && leaderboardOpen) { leaderboardOpen = false; render(); app.querySelector('#leaderboard')?.focus(); return; }
  if (event.key === 'Tab' && infoOpen) {
    const controls = [...app.querySelectorAll('.info-dialog button')];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (event.key === 'Escape' && infoOpen) {
    infoOpen = false;
    render();
    app.querySelector('#info')?.focus();
  }
});

setInterval(() => {
  if (!practice && game && !game.startedAt && game.seed !== new Date().toISOString().slice(0, 10) && !closed) {
    closed = true; render();
  }
}, 60_000);
init();

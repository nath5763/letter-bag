import { createGame, finish, publicGame, submitWord, timeLeft } from '../shared/engine.js';
import { resultCard } from '../shared/result.js';
import { api } from './api.js';

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
const localRound = () => practice || anonymous;

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
      game = anonymous ? createGame(data.game.seed) : data.game;
    }
    render();
  } catch (error) { app.innerHTML = `<div class="error-card"><h1>Bag unavailable</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Try again</button></div>`; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function view() { return localRound() ? publicGame(game) : { ...game, remaining: game.startedAt ? Math.max(0, Math.ceil((game.startedAt + game.config.seconds * 1000 - Date.now()) / 1000)) : game.config.seconds }; }

function render() {
  const state = view();
  const started = state.startedAt !== null;
  const ended = state.endedAt !== null || (started && state.remaining === 0);
  const active = started && !ended;
  const unavailable = !practice && !started && (closed || game.seed !== new Date().toISOString().slice(0, 10));
  const result = ended ? resultCard(game, { practice, anonymous, postUrl }) : null;
  const word = selected.map(id => game.rack.find(tile => tile.id === id)?.letter || '').join('');
  const pct = started ? Math.max(0, state.remaining / game.config.seconds * 100) : 100;
  const wordTiles = selected.map(id => {
    const letter = game.rack.find(tile => tile.id === id)?.letter || '';
    return `<button type="button" class="chosen" data-remove="${id}" aria-label="Remove ${letter} from word">${letter}</button>`;
  }).join('');
  app.innerHTML = `
    <header class="topline"><span class="brand">DAILY LETTER BAG</span><div class="top-actions"><span class="mode">${practice ? 'PRACTICE' : `GAME #${escapeHtml(game.seed.replaceAll('-', ''))}`}</span>${!started ? '<button type="button" class="info-button" id="info" aria-haspopup="dialog">How to play</button>' : ''}</div></header>
    <section class="dashboard"><div><span class="label">SCORE</span><strong>${state.score}</strong></div><div><span class="label">TIME</span><strong id="time-value" class="${state.remaining <= 10 && active ? 'urgent' : ''}"><span id="time-count">${state.remaining}</span><small>s</small></strong></div><div><span class="label">BAG</span><strong>${state.bagRemaining}</strong></div></section>
    <div class="timer" aria-hidden="true"><span style="width:${pct}%"></span></div>
    ${ended ? `<section class="result-stage"><div class="result-card" aria-label="${escapeHtml(result.label)}"><div class="result-card-top"><span class="label">${escapeHtml(result.label)}</span><span class="result-number">${result.gameNumber ? `GAME #${result.gameNumber}` : 'PRACTICE'}</span></div><strong>${state.score}</strong><span class="result-score-label">POINTS</span><div class="result-stats"><div><b>${result.wordCount}</b><span>WORDS</span></div><div><b>${result.longest}</b><span>LONGEST WORD</span></div></div><p>Copy this summary without revealing any letters or words.</p><div class="result-actions"><button type="button" class="primary" id="copy-result">Copy result</button></div></div>${state.words.length ? `<section class="history"><div class="section-head"><span>WORDS PLAYED</span><span>${state.words.length}</span></div><div class="word-list">${[...state.words].reverse().map(entry => `<div><span>${escapeHtml(entry.word)}</span><b>+${entry.points}</b></div>`).join('')}</div></section>` : ''}</section>` : `
    <section class="tabletop"><div class="bag-scene" aria-hidden="true"><div class="draw-bag"><span class="bag-stitch"></span><span class="bag-mark">LB</span></div><span class="bag-caption">LETTER BAG</span></div>
      ${active ? `<section class="compose"><div class="section-head"><span>YOUR WORD</span><span id="word-points">${word.length >= 3 ? `+${1 + word.length * (word.length + 1) / 2} POINTS` : '3 LETTERS MINIMUM'}</span></div><div class="word-controls"><div class="wordline">${wordTiles || '<span>Tap letters to form a word</span>'}</div><button type="button" class="back-button" id="back" ${!selected.length ? 'disabled' : ''} aria-label="Remove last letter">&larr; Back</button></div></section>` : ''}
      <section class="play-area"><div class="section-head"><span>YOUR LETTERS</span><span>${game.rack.length} AVAILABLE</span></div><div class="rack">${game.rack.map((tile, index) => `<button type="button" class="tile ${!started ? 'masked' : ''} ${selected.includes(tile.id) ? 'picked' : ''} ${arrivingTiles.has(tile.id) ? 'drawn' : ''}" style="--draw-index:${index}" data-tile="${tile.id}" ${!active || selected.includes(tile.id) ? 'disabled' : ''} aria-label="${started ? `Letter ${tile.letter}` : 'Hidden letter'}">${started ? tile.letter : '?'}</button>`).join('')}</div></section>
      <section class="preview-area"><div class="section-head"><span>UP NEXT</span><span>PREVIEW</span></div><div class="preview">${state.bag.map(tile => `<span class="preview-tile ${!started ? 'masked' : ''}">${started ? tile.letter : '?'}</span>`).join('') || '<span class="empty">The bag is empty</span>'}</div></section></section>
    <section class="round-actions"><div class="actions">${!started ? unavailable ? '<div class="end-card"><span class="label">PUZZLE CLOSED</span><p>This daily puzzle is closed. Open today\'s post to play.</p></div>' : '<button type="button" class="primary" id="start">Start</button>' : `<button type="button" class="primary" id="submit" ${selected.length < 3 || busy ? 'disabled' : ''}>Play word</button><button type="button" class="secondary" id="clear" ${!selected.length ? 'disabled' : ''}>Clear</button><button type="button" class="text-button" id="finish">Finish early</button>`}</div></section>`}
    <div class="feedback" role="status">${escapeHtml(message)}</div>
    ${practice && !active ? `<footer class="practice-tools"><button id="replay">Replay seed</button><button id="new">New puzzle</button><span>Local practice &middot; unlimited attempts</span></footer>` : ''}
    ${infoOpen && !started ? `<div class="info-backdrop" id="info-backdrop"><section class="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-title"><button type="button" class="info-close" id="info-close" aria-label="Close instructions">&times;</button><span class="label">HOW TO PLAY</span><h2 id="info-title">Daily Letter Bag</h2><ul><li>You have ${game.config.seconds} seconds to make as many words as you can.</li><li>Tap at least 3 wooden letters to form a word, then tap Play word.</li><li>Used letters leave your rack. The bag replaces them in order until it is empty; the next five letters appear in the preview.</li><li>Each word scores 1 point plus 1, 2, 3, and so on for each letter position. A 3-letter word earns 7 points.</li><li>A word can score once per round. Invalid words do not use letters.</li>${practice ? '' : '<li>Signed-in players get one scored attempt per UTC day.</li>'}</ul><button type="button" class="primary" id="info-done">Got it</button></section></div>` : ''}`;
  arrivingTiles = new Set();
  bind();
  if (infoOpen && !started) app.querySelector('#info-close')?.focus();
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
    return `<button type="button" class="chosen" data-remove="${id}" title="Tap to remove this letter" aria-label="Remove ${letter} from word">${letter}</button>`;
  }).join('') || '<span>Tap letters to form a word</span>';
  const length = selected.length;
  app.querySelector('#word-points').textContent = length >= 3 ? `+${1 + length * (length + 1) / 2} POINTS` : '3 LETTERS MINIMUM';
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
    try { busy = true; if (localRound()) game = { ...game, startedAt: Date.now() }; else game = (await api('start')).game; arrivingTiles = new Set(game.rack.map(tile => tile.id)); selected = []; message = ''; render(); }
    catch (error) { message = error.message; render(); } finally { busy = false; }
  });
  app.querySelector('#submit')?.addEventListener('click', async () => {
    try {
      busy = true;
      refreshSelection();
      const result = localRound() ? submitWord(game, selected) : await api('submit', { ids: selected });
      if (!result.error) arrivingTiles = new Set(result.game.rack.filter(tile => !game.rack.some(old => old.id === tile.id)).map(tile => tile.id));
      game = result.game; message = result.error || (result.game.words.at(-1)?.word?.toUpperCase() + ' accepted');
      if (!result.error) selected = [];
      render();
    } catch (error) { message = error.message; render(); } finally {
      busy = false;
      if (app.querySelector('#submit')) refreshSelection();
    }
  });
  app.querySelector('#finish')?.addEventListener('click', async () => {
    try { game = localRound() ? finish(game) : (await api('finish')).game; selected = []; message = ''; render(); }
    catch (error) { message = error.message; render(); }
  });
  app.querySelector('#replay')?.addEventListener('click', () => { game = createGame(seed, config); selected = []; message = ''; render(); });
  app.querySelector('#new')?.addEventListener('click', () => { seed = `practice-${Date.now()}`; game = createGame(seed, config); selected = []; message = ''; render(); });
}

document.addEventListener('keydown', event => {
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
    closed = true; render(); return;
  }
  if (!game?.startedAt || game.endedAt) return;
  const remaining = timeLeft(game);
  if (remaining === 0) { game = finish(game); selected = []; render(); return; }
  const count = app.querySelector('#time-count');
  const bar = app.querySelector('.timer span');
  if (count) count.textContent = remaining;
  if (bar) bar.style.width = `${remaining / game.config.seconds * 100}%`;
  app.querySelector('#time-value')?.classList.toggle('urgent', remaining <= 10);
}, 200);
init();

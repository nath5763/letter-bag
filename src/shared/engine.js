import { WORDS } from './words.js';

export const DEFAULTS = Object.freeze({ rack: 15, bag: 15 });
export const LETTER_BONUSES = Object.freeze({ Q: 2, Z: 2, J: 1, X: 1, K: 1, V: 1 });
export const letterBonus = letter => LETTER_BONUSES[letter.toUpperCase()] || 0;
export function scoreWord(word) {
  const basePoints = 1 + word.length * (word.length + 1) / 2;
  const bonusPoints = [...word].reduce((total, letter) => total + letterBonus(letter), 0);
  return { basePoints, bonusPoints, points: basePoints + bonusPoints };
}
const LETTERS = 'AAAAAAAABCDEEEEEEEEEEEFGHIIIIIIJKLMNNOOOOOOOPQRRRRSSSSTTTTTTUUUVWYZ';
const VOWELS = 'AEIOU';
const VOWEL_POOL = [...LETTERS].filter(letter => VOWELS.includes(letter)).join('');
const CONSONANT_POOL = [...LETTERS].filter(letter => !VOWELS.includes(letter)).join('');

function hashSeed(value) {
  let h = 2166136261;
  for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

function random(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateOptions(options = {}) {
  const result = { rack: options.rack ?? DEFAULTS.rack, bag: options.bag ?? DEFAULTS.bag };
  if (!Number.isInteger(result.rack) || result.rack < 3 || result.rack > 30) throw Error('rack must be 3–30');
  if (!Number.isInteger(result.bag) || result.bag < 0 || result.bag > 60) throw Error('bag must be 0–60');
  return result;
}

function shuffle(letters, rng) {
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
}

export function puzzle(seed, options = {}) {
  const config = validateOptions(options);
  const rng = random(seed);
  const count = config.rack + config.bag;
  const totalVowels = Math.round(count * .4);
  const rackTarget = Math.round(config.rack * .4);
  const bagTarget = Math.round(config.bag * .4);
  const vowelCount = word => [...word].filter(letter => VOWELS.includes(letter)).length;
  const draw = pool => pool[Math.floor(rng() * pool.length)];

  const anchors = ['CAT', 'DOG', 'SUN', 'EAR', 'NOTE', 'STAR', 'RAIN', 'FIRE', 'GAME', 'LAMP'];
  const playable = anchors.filter(word =>
    word.length <= config.rack && WORDS.has(word.toLowerCase()) &&
    vowelCount(word) <= totalVowels && word.length - vowelCount(word) <= count - totalVowels);
  const anchor = playable[Math.floor(rng() * playable.length)] || 'CAT';
  const anchorVowels = vowelCount(anchor);
  const anchorConsonants = anchor.length - anchorVowels;

  const possible = Array.from({ length: config.rack + 1 }, (_, vowels) => vowels).filter(vowels =>
    vowels >= anchorVowels && config.rack - vowels >= anchorConsonants &&
    totalVowels - vowels >= 0 && totalVowels - vowels <= config.bag);
  const nearby = possible.filter(vowels =>
    Math.abs(vowels - rackTarget) <= 1 &&
    Math.abs(totalVowels - vowels - bagTarget) <= 1);
  const choices = nearby.length ? nearby : [possible.reduce((best, vowels) =>
    Math.abs(vowels - rackTarget) + Math.abs(totalVowels - vowels - bagTarget) <
    Math.abs(best - rackTarget) + Math.abs(totalVowels - best - bagTarget) ? vowels : best)];
  const weighted = choices.flatMap(vowels =>
    Array.from({ length: vowels === rackTarget ? 2 : 1 }, () => vowels));
  const rackVowels = weighted[Math.floor(rng() * weighted.length)];
  const bagVowels = totalVowels - rackVowels;

  // Keep one playable word in the opening rack, then shuffle both balanced halves.
  const rack = shuffle([
    ...anchor,
    ...Array.from({ length: rackVowels - anchorVowels }, () => draw(VOWEL_POOL)),
    ...Array.from({ length: config.rack - rackVowels - anchorConsonants }, () => draw(CONSONANT_POOL))
  ], rng);
  const bag = shuffle([
    ...Array.from({ length: bagVowels }, () => draw(VOWEL_POOL)),
    ...Array.from({ length: config.bag - bagVowels }, () => draw(CONSONANT_POOL))
  ], rng);
  return [...rack, ...bag].map((letter, id) => ({ id, letter }));
}

export function createGame(seed, options = {}, now = /** @type {number | null} */ (null)) {
  const config = validateOptions(options);
  const tiles = puzzle(seed, config);
  return {
    seed: String(seed), config, rack: tiles.slice(0, config.rack),
    bag: tiles.slice(config.rack), words: [], score: 0,
    startedAt: now, endedAt: null
  };
}

export function finish(game, now = Date.now()) {
  if (game.endedAt !== null) return game;
  return { ...game, endedAt: now };
}

export function submitWord(game, ids, now = Date.now()) {
  if (game.startedAt === null) return { game, error: 'Start the round first' };
  if (game.endedAt !== null) return { game, error: 'Round has ended' };
  if (!Array.isArray(ids) || ids.length < 3 || new Set(ids).size !== ids.length) return { game, error: 'Select at least three different tiles' };
  const chosen = ids.map(id => game.rack.find(tile => tile.id === id));
  if (chosen.some(tile => !tile)) return { game, error: 'Those tiles are no longer in the rack' };
  const word = chosen.map(tile => tile.letter).join('').toLowerCase();
  if (game.words.some(entry => entry.word === word)) return { game, error: 'Already played' };
  if (!WORDS.has(word)) return { game, error: 'Not in the word list' };
  const scoring = scoreWord(word);
  const consumed = new Set(ids);
  const drawn = game.bag.slice(0, ids.length);
  const next = {
    ...game,
    rack: [...game.rack.filter(tile => !consumed.has(tile.id)), ...drawn].sort((a, b) => a.id - b.id),
    bag: game.bag.slice(drawn.length),
    words: [...game.words, { word, ...scoring }],
    score: game.score + scoring.points
  };
  if (next.rack.length < 3) next.endedAt = now;
  return { game: next, error: null };
}

export function publicGame(game) {
  const hidden = game.startedAt === null;
  return {
    ...game,
    rack: hidden ? game.rack.map(tile => ({ ...tile, letter: '?' })) : game.rack,
    bag: game.bag.slice(0, 5).map(tile => hidden ? { ...tile, letter: '?' } : tile),
    bagRemaining: game.bag.length
  };
}

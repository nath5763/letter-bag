import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finish, letterBonus, puzzle, publicGame, scoreWord, submitWord } from '../src/shared/engine.js';
import { WORDS } from '../src/shared/words.js';

test('broad lexicon includes reported words and inflections', () => {
  assert.ok(WORDS.size > 100_000);
  for (const word of ['cavity', 'cavities', 'okra', 'okras', 'venus']) assert.ok(WORDS.has(word), word);
});

test('capitalized dictionary entries are accepted through uppercase tiles', () => {
  const original = createGame('venus', {}, 1000);
  const game = { ...original, rack: 'VENUS'.split('').map((letter, id) => ({ letter, id })), bag: [] };
  const result = submitWord(game, [0, 1, 2, 3, 4], 2000);
  assert.equal(result.error, null);
  assert.equal(result.game.words[0].word, 'venus');
});

test('letters stay hidden in the public view until the round starts', () => {
  const waiting = createGame('masked');
  const hidden = publicGame(waiting);
  assert.ok(hidden.rack.every(tile => tile.letter === '?'));
  assert.ok(hidden.bag.every(tile => tile.letter === '?'));
  assert.notEqual(waiting.rack[0].letter, '?');
  const running = publicGame(createGame('masked', {}, 1000), 2000);
  assert.ok(running.rack.some(tile => tile.letter !== '?'));
  assert.ok(running.bag.some(tile => tile.letter !== '?'));
});

test('seed repeats the same ordered puzzle and opening rack is playable', () => {
  assert.deepEqual(puzzle('example'), puzzle('example'));
  assert.notDeepEqual(puzzle('example'), puzzle('other'));
  const rack = puzzle('example').slice(0, 15).map(t => t.letter);
  assert.ok([...WORDS].some(word => word.length <= 15 && [...word.toUpperCase()].every((ch, index) => {
    const count = [...word.toUpperCase()].slice(0, index + 1).filter(c => c === ch).length;
    return rack.filter(c => c === ch).length >= count;
  })));
});

test('default puzzles keep twelve vowels across balanced rack and bag halves', () => {
  const openingCounts = new Set();
  for (let i = 0; i < 200; i++) {
    const tiles = puzzle('balance-' + i);
    const rackVowels = tiles.slice(0, 15).filter(tile => 'AEIOU'.includes(tile.letter)).length;
    const bagVowels = tiles.slice(15).filter(tile => 'AEIOU'.includes(tile.letter)).length;
    assert.equal(tiles.length, 30);
    assert.equal(rackVowels + bagVowels, 12);
    assert.equal(tiles.length - rackVowels - bagVowels, 18);
    assert.ok(rackVowels >= 5 && rackVowels <= 7);
    assert.ok(15 - rackVowels >= 8 && 15 - rackVowels <= 10);
    assert.equal(bagVowels, 12 - rackVowels);
    openingCounts.add(rackVowels);
  }
  assert.deepEqual([...openingCounts].sort(), [5, 6, 7]);
});

test('custom practice sizes keep the same approximate vowel ratio', () => {
  for (const [rack, bag] of [[3, 0], [5, 2], [15, 0], [30, 60]]) {
    const tiles = puzzle('custom-' + rack + '-' + bag, { rack, bag });
    const vowels = tiles.filter(tile => 'AEIOU'.includes(tile.letter)).length;
    assert.equal(tiles.length, rack + bag);
    assert.equal(vowels, Math.round((rack + bag) * .4));
  }
});

test('accepted word scores and consumes precise tiles in draw order', () => {
  const start = 1000;
  const game = createGame('example', {}, start);
  const word = [...WORDS].find(w => w.length >= 3 && [...w].every((ch, i) =>
    game.rack.filter(t => t.letter === ch.toUpperCase()).length >= [...w].slice(0, i + 1).filter(c => c === ch).length));
  assert.ok(word);
  const used = new Set();
  const ids = [...word].map(ch => {
    const tile = game.rack.find(t => t.letter === ch.toUpperCase() && !used.has(t.id));
    used.add(tile.id); return tile.id;
  });
  const result = submitWord(game, ids, start + 1000);
  assert.equal(result.error, null);
  assert.equal(result.game.score, scoreWord(word).points);
  assert.deepEqual(result.game.words[0], { word, ...scoreWord(word) });
  assert.deepEqual(result.game.bag, game.bag.slice(word.length));
  assert.deepEqual(result.game.rack.map(t => t.id), [...game.rack.filter(t => !used.has(t.id)), ...game.bag.slice(0, word.length)].sort((a,b) => a.id-b.id).map(t => t.id));
  assert.deepEqual(publicGame(result.game).bag, result.game.bag.slice(0, 5));
  assert.equal(submitWord(result.game, ids, start + 2000).error, 'Those tiles are no longer in the rack');
});

test('progressive scoring and every occurrence of a rare letter', () => {
  for (const [word, points] of Object.entries({ CAT: 7, JAM: 8, ZIP: 9, JAZZ: 16, QUIZ: 15, PLANT: 16 })) {
    assert.equal(scoreWord(word).points, points, word);
    assert.equal(scoreWord(word).basePoints, 1 + word.length * (word.length + 1) / 2);
  }
  assert.equal(scoreWord('JAZZ').bonusPoints, 5);
  assert.equal(scoreWord('jazz').bonusPoints, 5);
  for (const [letter, bonus] of Object.entries({ Q: 2, Z: 2, J: 1, X: 1, K: 1, V: 1, A: 0 }))
    assert.equal(letterBonus(letter), bonus);
});

test('a valid word receives its base and duplicate-letter bonus in the saved result', () => {
  const original = createGame('bonus', {}, 1000);
  const game = { ...original, rack: 'JAZZ'.split('').map((letter, id) => ({ letter, id })), bag: [] };
  const result = submitWord(game, [0, 1, 2, 3], 900000);
  assert.equal(result.error, null);
  assert.deepEqual(result.game.words[0], { word: 'jazz', basePoints: 11, bonusPoints: 5, points: 16 });
  assert.equal(result.game.score, 16);
  assert.equal(result.game.endedAt, 900000);
});

test('no clock expiry or lack of an immediate word ends a round; Finish ends it explicitly', () => {
  const game = createGame('example', {}, 1000);
  assert.deepEqual(game.config, { rack: 15, bag: 15 });
  assert.deepEqual(createGame('legacy', { seconds: 90 }).config, game.config);
  const ids = game.rack.slice(0, 3).map(t => t.id);
  assert.equal(submitWord(game, [ids[0], ids[0], ids[1]], 900000).game.score, 0);
  assert.equal(publicGame(game).endedAt, null);
  assert.equal('remaining' in publicGame(game), false);
  const stuck = { ...game, rack: 'QQQ'.split('').map((letter, id) => ({ letter, id })), bag: [] };
  assert.equal(submitWord(stuck, [0, 1, 2], 900000).error, 'Not in the word list');
  assert.equal(submitWord(stuck, [0, 1, 2], 900000).game.endedAt, null);
  const completed = finish(game, 900000);
  assert.equal(completed.endedAt, 900000);
  assert.equal(submitWord(completed, ids, 900001).error, 'Round has ended');
});

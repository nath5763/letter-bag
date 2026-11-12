import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finish, puzzle, publicGame, submitWord, timeLeft } from '../src/shared/engine.js';
import { WORDS } from '../src/shared/words.js';

test('broad lexicon includes reported words and inflections', () => {
  assert.ok(WORDS.size > 100_000);
  for (const word of ['cavity', 'cavities', 'okra', 'okras']) assert.ok(WORDS.has(word), word);
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
  assert.equal(result.game.score, 1 + word.length * (word.length + 1) / 2);
  assert.deepEqual(result.game.bag, game.bag.slice(word.length));
  assert.deepEqual(result.game.rack.map(t => t.id), [...game.rack.filter(t => !used.has(t.id)), ...game.bag.slice(0, word.length)].sort((a,b) => a.id-b.id).map(t => t.id));
  assert.deepEqual(publicGame(result.game).bag, result.game.bag.slice(0, 5));
  assert.equal(submitWord(result.game, ids, start + 2000).error, 'Those tiles are no longer in the rack');
});

test('invalid and expired submissions do not score', () => {
  const game = createGame('example', { seconds: 5 }, 1000);
  const ids = game.rack.slice(0, 3).map(t => t.id);
  assert.equal(submitWord(game, [ids[0], ids[0], ids[1]], 2000).game.score, 0);
  assert.equal(timeLeft(game, 6000), 0);
  assert.equal(submitWord(game, ids, 6000).game.score, 0);
  assert.equal(finish(game, 3000).endedAt, 3000);
});

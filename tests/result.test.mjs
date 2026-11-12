import test from 'node:test';
import assert from 'node:assert/strict';
import { resultCard } from '../src/shared/result.js';

test('daily result uses the UTC date as its game number without revealing words', () => {
  const game = {
    seed: '2026-11-11', score: 42,
    words: [{ word: 'cavity', points: 22 }, { word: 'okra', points: 11 }]
  };
  const result = resultCard(game, { postUrl: 'https://www.reddit.com/r/test/comments/abc/' });
  assert.equal(result.gameNumber, '20261111');
  assert.equal(result.wordCount, 2);
  assert.equal(result.longest, 6);
  assert.match(result.text, /Daily Letter Bag #20261111/);
  assert.match(result.text, /Score: 42/);
  assert.match(result.text, /https:\/\/www.reddit.com\/r\/test\/comments\/abc\//);
  assert.doesNotMatch(result.text, /cavity|okra/i);
});

test('practice and unsaved results identify their status', () => {
  const game = { seed: 'practice-demo', score: 0, words: [] };
  assert.match(resultCard(game, { practice: true }).text, /Practice round/);
  assert.match(resultCard(game, { anonymous: true }).text, /Unsaved round/);
  assert.equal(resultCard(game).longest, 0);
});

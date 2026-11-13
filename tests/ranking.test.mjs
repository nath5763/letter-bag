import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRows } from '../src/server/ranking.js';

test('daily leaderboard sorts by points, then fewer words, with shared exact ties', () => {
  const entries = [
    { member: 'd', score: 50, wordCount: 4 },
    { member: 'b', score: 60, wordCount: 5 },
    { member: 'c', score: 60, wordCount: 3 },
    { member: 'a', score: 60, wordCount: 3 },
    { member: 'e', score: 40, wordCount: 1 }
  ];
  assert.deepEqual(rankRows(entries).map(({ member, rank }) => [member, rank]),
    [['a', 1], ['c', 1], ['b', 3], ['d', 4], ['e', 5]]);
});

test('all-time score ties share rank without completion time or word counts', () => {
  const entries = [{ member: 'b', score: 20 }, { member: 'a', score: 20 }, { member: 'c', score: 10 }];
  assert.deepEqual(rankRows(entries).map(({ member, rank }) => [member, rank]),
    [['a', 1], ['b', 1], ['c', 3]]);
});

test('older daily results without a word count remain rankable by points', () => {
  const entries = [{ member: 'old', score: 30 }, { member: 'new', score: 40, wordCount: 2 }];
  assert.deepEqual(rankRows(entries).map(({ member, rank }) => [member, rank]),
    [['new', 1], ['old', 2]]);
});

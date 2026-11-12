import test from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, nextProfile } from '../src/server/streak.js';

test('qualifying completions on consecutive UTC puzzle dates extend a streak', () => {
  const first = nextProfile(null, '2026-11-11');
  assert.deepEqual(first, { lastDay: '2026-11-11', current: 1, best: 1 });
  assert.deepEqual(nextProfile(first, '2026-11-12'), { lastDay: '2026-11-12', current: 2, best: 2 });
});

test('a missed UTC day resets current streak but preserves the best', () => {
  const profile = { lastDay: '2026-11-10', current: 5, best: 5 };
  assert.equal(currentStreak(profile, '2026-11-12'), 0);
  assert.deepEqual(nextProfile(profile, '2026-11-12'), { lastDay: '2026-11-12', current: 1, best: 5 });
});

test('the previous puzzle date remains current until today is missed', () => {
  const profile = { lastDay: '2026-11-11', current: 3, best: 4 };
  assert.equal(currentStreak(profile, '2026-11-12'), 3);
});

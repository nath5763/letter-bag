import test from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, nextProfile, unlocksCenturyBadge, unlocksLifetimeBadge } from '../src/server/streak.js';

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

test('100+ daily badge unlocks at the threshold only once', () => {
  assert.equal(unlocksCenturyBadge(null, 92, 99), false);
  assert.equal(unlocksCenturyBadge(null, 92, 100), true);
  assert.equal(unlocksCenturyBadge(null, 99, 101), true);
  assert.equal(unlocksCenturyBadge(null, 100, 100), false);
  assert.equal(unlocksCenturyBadge({ centuryBadge: true }, 99, 101), false);
});

test('a permanent badge survives later streak updates', () => {
  const profile = { lastDay: '2026-11-11', current: 1, best: 1, centuryBadge: true, lifetimePoints: 20_000, bottomlessBagBadge: true };
  assert.deepEqual(nextProfile(profile, '2026-11-12'), {
    lastDay: '2026-11-12', current: 2, best: 2, centuryBadge: true, lifetimePoints: 20_000, bottomlessBagBadge: true
  });
});

test('Bottomless Bag unlocks when completed daily points reach 20,000', () => {
  assert.equal(unlocksLifetimeBadge(null, 19_980, 19), false);
  assert.equal(unlocksLifetimeBadge(null, 19_980, 20), true);
  assert.equal(unlocksLifetimeBadge(null, 19_980, 21), true);
  assert.equal(unlocksLifetimeBadge(null, 20_000, 10), false);
  assert.equal(unlocksLifetimeBadge({ bottomlessBagBadge: true }, 19_980, 20), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { storedJson } from '../src/server/stored-json.js';

test('saved Redis JSON loads from string and playtest object responses', () => {
  const round = { seed: '2026-11-12', rack: [{ id: 0, letter: 'A' }] };
  assert.deepEqual(storedJson(JSON.stringify(round)), round);
  assert.deepEqual(storedJson(round), round);
  assert.deepEqual(storedJson({ value: JSON.stringify(round) }), round);
  assert.equal(storedJson(null), null);
  assert.equal(storedJson(undefined), null);
});

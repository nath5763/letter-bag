import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/client/api.js';

test('daily state reads with GET and round actions use POST, including empty bodies', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ game: {} }) };
  };
  await api('state', undefined, fetcher);
  await api('start', undefined, fetcher);
  await api('submit', { ids: [1, 2, 3] }, fetcher);
  await api('finish', undefined, fetcher);
  assert.deepEqual(requests.map(({ url, options }) => [url, options.method || 'GET']), [
    ['/api/state', 'GET'], ['/api/start', 'POST'], ['/api/submit', 'POST'], ['/api/finish', 'POST']
  ]);
  assert.deepEqual(JSON.parse(requests[2].options.body), { ids: [1, 2, 3] });
  assert.equal(requests[3].options.body, undefined);
});

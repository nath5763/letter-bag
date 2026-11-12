export async function api(path, body, fetcher = fetch) {
  const response = await fetcher(`/api/${path}`, path === 'state' ? {} : {
    method: 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  let data;
  try { data = await response.json(); }
  catch {
    throw Error(response.ok
      ? 'The game server returned an invalid response. Check the playtest logs.'
      : `The game server failed (${response.status}). Check the playtest logs.`);
  }
  if (!response.ok) throw Error(data.error || 'Could not reach the game server');
  return data;
}

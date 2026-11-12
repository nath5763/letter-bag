// Redis returns strings in production, but playtest can return decoded objects.
export function storedJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return JSON.parse(raw);
  if (typeof raw === 'object') {
    if (Object.keys(raw).length === 1 && typeof raw.value === 'string') {
      return JSON.parse(raw.value);
    }
    return raw;
  }
  throw Error('Unexpected Redis value');
}

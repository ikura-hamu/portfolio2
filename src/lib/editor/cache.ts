// Cache successful reads only. Clearing also detaches in-flight results.
export function readCache<T>(
  load: (key: string) => Promise<T>,
  now = Date.now,
) {
  const entries = new Map<string, { expires: number; value: Promise<T> }>();
  return {
    clear() {
      entries.clear();
    },
    get(key: string): Promise<T> {
      const current = entries.get(key);
      if (current && current.expires > now()) return current.value;
      const entry = {
        expires: now() + 60_000,
        value: Promise.resolve().then(() => load(key)),
      };
      entries.set(key, entry);
      entry.value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return entry.value;
    },
  };
}

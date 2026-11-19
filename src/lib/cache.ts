type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();

export const cache = {
  get<T>(key: string): T | undefined {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      store.delete(key);
      return undefined;
    }
    return hit.value as T;
  },
  set<T>(key: string, value: T, ttlMs = 60_000): T {
    store.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  },
  clear() {
    store.clear();
  },
  /** get-or-compute helper */
  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = cache.get<T>(key);
    if (hit !== undefined) return hit;
    return cache.set(key, await fn(), ttlMs);
  },
};

export const cacheKey = (route: string, query: Record<string, unknown>) =>
  route +
  JSON.stringify(
    Object.keys(query)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => ((acc[k] = query[k]), acc), {}),
  );

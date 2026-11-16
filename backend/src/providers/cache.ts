interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;

    const promise = (async () => {
      try {
        const value = await loader();
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

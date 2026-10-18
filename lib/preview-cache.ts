/** Process-local, display-only snapshots. Only simultaneous reads are shared;
 * every later refresh starts a new read. Mutations must never use this cache. */
export class PreviewCache<T> {
  private snapshot: { key: string; value: T } | null = null;
  private pending: { key: string; promise: Promise<T> } | null = null;

  get(key: string): T | null {
    return this.snapshot?.key === key ? structuredClone(this.snapshot.value) : null;
  }

  async refresh(key: string, read: () => Promise<T>, successful: (value: T) => boolean): Promise<T> {
    if (this.pending?.key === key) return structuredClone(await this.pending.promise);
    const pending = { key, promise: Promise.resolve().then(read) };
    this.pending = pending;
    try {
      const value = await pending.promise;
      if (this.pending === pending && successful(value)) {
        this.snapshot = { key, value: structuredClone(value) };
      }
      return structuredClone(value);
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }
}
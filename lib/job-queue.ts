interface Entry {
  id: string;
  resources: readonly string[];
  run: () => Promise<boolean>;
  resolve: (value: boolean) => void;
  reject: (error: unknown) => void;
}

/** FIFO for competing resources; unrelated work can pass a waiting job. */
export class JobQueue {
  private pending: Entry[] = [];
  private active = new Map<string, readonly string[]>();

  has(id: string): boolean {
    return this.active.has(id) || this.pending.some((entry) => entry.id === id);
  }

  enqueue(id: string, resources: readonly string[], run: () => Promise<boolean>): Promise<boolean> {
    if (this.has(id)) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      this.pending.push({ id, resources, run, resolve, reject });
      this.drain();
    });
  }

  private drain(): void {
    const waitingResources = new Set<string>();
    for (let index = 0; index < this.pending.length;) {
      const entry = this.pending[index];
      const blocked = entry.resources.some((resource) => waitingResources.has(resource) ||
        [...this.active.values()].some((held) => held.includes(resource)));
      if (blocked) {
        entry.resources.forEach((resource) => waitingResources.add(resource));
        index++;
        continue;
      }
      this.pending.splice(index, 1);
      this.active.set(entry.id, entry.resources);
      const release = () => {
        this.active.delete(entry.id);
        this.drain();
      };
      void Promise.resolve().then(entry.run).then((result) => {
        release();
        entry.resolve(result);
      }, (error: unknown) => {
        release();
        entry.reject(error);
      });
    }
  }
}
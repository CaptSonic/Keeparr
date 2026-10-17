import { describe, expect, it } from 'vitest';
import { mapConcurrent } from './concurrency';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('bounded concurrent reads', () => {
  it('refills free slots without waiting for the slowest read and preserves order', async () => {
    const reads = Array.from({ length: 4 }, () => deferred<number>());
    const started: number[] = [];
    let active = 0;
    let peak = 0;
    const result = mapConcurrent(reads, 2, async (read, index) => {
      started.push(index);
      peak = Math.max(peak, ++active);
      try { return await read.promise; }
      finally { active--; }
    });
    expect(started).toEqual([0, 1]);
    reads[1].resolve(10);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    reads[2].resolve(20);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3]);
    reads[3].resolve(30);
    reads[0].resolve(0);
    await expect(result).resolves.toEqual([0, 10, 20, 30]);
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  it('stops scheduling after failure and waits for active reads to finish', async () => {
    const reads = Array.from({ length: 3 }, () => deferred<number>());
    const started: number[] = [];
    let settled = false;
    const error = new Error('unavailable');
    const result = mapConcurrent(reads, 2, (read, index) => {
      started.push(index);
      return read.promise;
    }).catch((reason) => { settled = true; return reason; });
    reads[0].reject(error);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(settled).toBe(false);
    reads[1].resolve(1);
    expect(await result).toBe(error);
    expect(started).toEqual([0, 1]);
  });

  it('handles empty inputs and rejects invalid concurrency limits', async () => {
    await expect(mapConcurrent([], 4, async () => 1)).resolves.toEqual([]);
    await expect(mapConcurrent([1], 0, async (n) => n)).rejects.toThrow('Invalid concurrency');
    await expect(mapConcurrent([1], 1.5, async (n) => n)).rejects.toThrow('Invalid concurrency');
    await expect(mapConcurrent([1], 1, () => { throw undefined; })).rejects.toBeUndefined();
  });
});
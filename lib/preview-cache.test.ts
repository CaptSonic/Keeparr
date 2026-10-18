import { describe, expect, it, vi } from 'vitest';
import { PreviewCache } from './preview-cache';

describe('display-only preview cache', () => {
  it('shares concurrent reads, isolates results and refreshes again afterwards', async () => {
    const cache = new PreviewCache<{ count: number }>();
    let finish!: (value: { count: number }) => void;
    const read = vi.fn(() => new Promise<{ count: number }>((resolve) => { finish = resolve; }));
    const first = cache.refresh('a', read, () => true);
    const second = cache.refresh('a', read, () => true);
    await Promise.resolve();
    expect(read).toHaveBeenCalledOnce();
    finish({ count: 1 });
    const [a, b] = await Promise.all([first, second]);
    a.count = 9;
    expect(b.count).toBe(1);
    expect(cache.get('a')).toEqual({ count: 1 });
    expect(cache.get('b')).toBeNull();
    await cache.refresh('a', async () => ({ count: 2 }), () => true);
    expect(cache.get('a')).toEqual({ count: 2 });
  });

  it('preserves the last successful snapshot on paused reads and errors', async () => {
    const cache = new PreviewCache<number>();
    await cache.refresh('a', async () => 1, () => true);
    await cache.refresh('a', async () => 2, () => false);
    await expect(cache.refresh('a', async () => { throw new Error('offline'); }, () => true))
      .rejects.toThrow('offline');
    expect(cache.get('a')).toBe(1);
    expect(await cache.refresh('a', async () => 3, () => true)).toBe(3);
  });

  it('does not let an older configuration overwrite a newer read', async () => {
    const cache = new PreviewCache<number>();
    let finish!: (value: number) => void;
    const older = cache.refresh('a', () => new Promise<number>((resolve) => { finish = resolve; }), () => true);
    await Promise.resolve();
    await cache.refresh('b', async () => 2, () => true);
    finish(1);
    await older;
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
  });
});
import { describe, expect, it, vi } from 'vitest';
import { JobQueue } from './job-queue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('resource-aware job queue', () => {
  it('allows immediate resubmission after the completion promise resolves', async () => {
    const queue = new JobQueue();
    expect(await queue.enqueue('scan', ['media'], async () => true)).toBe(true);
    expect(queue.has('scan')).toBe(false);
    expect(await queue.enqueue('scan', ['media'], async () => true)).toBe(true);
  });
  it('serializes conflicting jobs, deduplicates queued and active ids, and allows independent jobs', async () => {
    const queue = new JobQueue();
    const gate = deferred();
    const order: string[] = [];
    const first = queue.enqueue('scan', ['media'], async () => { order.push('scan'); await gate.promise; return true; });
    const waiting = queue.enqueue('watch', ['media'], async () => { order.push('watch'); return true; });
    const other = queue.enqueue('arr', ['arr'], async () => { order.push('arr'); return true; });
    const duplicate = vi.fn(async () => true);
    expect(await queue.enqueue('scan', ['media'], duplicate)).toBe(false);
    expect(await queue.enqueue('watch', ['media'], duplicate)).toBe(false);
    expect(await other).toBe(true);
    expect(order).toEqual(['scan', 'arr']);
    expect(duplicate).not.toHaveBeenCalled();
    gate.resolve();
    expect(await Promise.all([first, waiting])).toEqual([true, true]);
    await tick();
    expect(order).toEqual(['scan', 'arr', 'watch']);
    expect(queue.has('scan')).toBe(false);
    expect(queue.has('watch')).toBe(false);
  });

  it('prevents later jobs from starving an earlier multi-resource barrier', async () => {
    const queue = new JobQueue();
    const gate = deferred();
    const order: string[] = [];
    const first = queue.enqueue('watch', ['media'], async () => { order.push('watch'); await gate.promise; return true; });
    const barrier = queue.enqueue('handoff', ['media', 'arr'], async () => { order.push('handoff'); return true; });
    const later = queue.enqueue('arr', ['arr'], async () => { order.push('arr'); return true; });
    const backup = queue.enqueue('backup', [], async () => { order.push('backup'); return true; });
    await backup;
    expect(order).toEqual(['watch', 'backup']);
    gate.resolve();
    await Promise.all([first, barrier, later]);
    expect(order).toEqual(['watch', 'backup', 'handoff', 'arr']);
  });

  it('releases resources after rejected and synchronously throwing jobs', async () => {
    const queue = new JobQueue();
    const gate = deferred();
    const failed = queue.enqueue('first', ['media'], async () => { await gate.promise; throw new Error('offline'); });
    const checked = expect(failed).rejects.toThrow('offline');
    const next = queue.enqueue('next', ['media'], () => { throw new Error('sync failure'); });
    const checkedNext = expect(next).rejects.toThrow('sync failure');
    const final = queue.enqueue('last', ['media'], async () => true);
    gate.resolve();
    await checked;
    await checkedNext;
    expect(await final).toBe(true);
    await tick();
    expect(await queue.enqueue('first', ['media'], async () => true)).toBe(true);
  });
});
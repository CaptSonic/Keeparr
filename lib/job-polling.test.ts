import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollJob } from './job-polling';

afterEach(() => vi.useRealTimers());

describe('job status polling', () => {
  it('waits for a slow request before scheduling another', async () => {
    vi.useFakeTimers();
    let resolve!: (done: boolean) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<boolean>((done) => { resolve = done; }))
      .mockResolvedValue(true);
    const complete = vi.fn();
    const cancel = pollJob(read, complete, vi.fn());
    await vi.advanceTimersByTimeAsync(10000);
    expect(read).toHaveBeenCalledTimes(1);
    resolve(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(read).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledOnce();
    cancel();
  });
  it('reports failure once and stops retrying automatically', async () => {
    vi.useFakeTimers();
    const failed = vi.fn();
    const complete = vi.fn();
    const read = vi.fn().mockRejectedValue(new Error('offline'));
    pollJob(read, complete, failed);
    await vi.advanceTimersByTimeAsync(10000);
    expect(failed).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledOnce();
  });
  it('aborts an in-flight request without reporting an error after cancellation', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    let reject!: (error: Error) => void;
    const failed = vi.fn();
    const complete = vi.fn();
    const cancel = pollJob((value) => {
      signal = value;
      return new Promise<boolean>((_, fail) => { reject = fail; });
    }, complete, failed);
    await vi.advanceTimersByTimeAsync(1500);
    cancel();
    expect(signal.aborted).toBe(true);
    reject(new Error('aborted'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(failed).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
  it('can cancel before the first request starts', async () => {
    vi.useFakeTimers();
    const read = vi.fn();
    pollJob(read, vi.fn(), vi.fn())();
    await vi.advanceTimersByTimeAsync(10000);
    expect(read).not.toHaveBeenCalled();
  });
});
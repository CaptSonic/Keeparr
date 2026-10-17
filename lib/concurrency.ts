/** Ordered, bounded reads. On failure stop scheduling and drain active reads
 * before rejecting, so callers never leave background work behind. */
export async function mapConcurrent<T, R>(
  values: readonly T[], limit: number, read: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid concurrency limit.');
  const results: R[] = new Array(values.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (!failed && next < values.length) {
      const index = next++;
      try {
        results[index] = await read(values[index], index);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
  }));
  if (failed) throw failure;
  return results;
}
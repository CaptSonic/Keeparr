/** One request at a time. Cancellation stops both the timer and in-flight read. */
export function pollJob(
  read: (signal: AbortSignal) => Promise<boolean>,
  complete: () => void,
  failed: () => void,
  delay = 1500,
): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    try {
      const done = await read(controller.signal);
      if (controller.signal.aborted) return;
      if (done) { complete(); return; }
      timer = setTimeout(tick, delay);
    } catch {
      if (!controller.signal.aborted) failed();
    }
  };
  timer = setTimeout(tick, delay);
  return () => { controller.abort(); clearTimeout(timer); };
}
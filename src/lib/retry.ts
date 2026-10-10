/** Pauses before the second and third attempts. */
const RETRY_DELAYS_MS: readonly number[] = [600, 1800];

/**
 * Waits `ms`, or less when the signal aborts. It never rejects: an abort ends
 * the wait early, an already-aborted signal ends it at once, and the abort
 * listener comes off again when the timer wins.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Runs a read once, then again after each pause in `delays` (three attempts
 * by default, each pause longer), so a passing network blip never reaches the
 * screen. A read fails by resolving null or throwing; null comes back once
 * every attempt has failed, or as soon as the signal aborts.
 */
export async function readWithRetries<T>(
  read: () => Promise<T | null>,
  signal?: AbortSignal,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<T | null> {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]!, signal);
    if (signal?.aborted) return null;
    const data = await read().catch(() => null);
    if (data !== null) return data;
  }
  return null;
}

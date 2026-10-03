/** Pauses before the second and third attempts. */
const RETRY_DELAYS_MS: readonly number[] = [600, 1800];

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/**
 * Runs a read up to three times, pausing longer before each retry, so a
 * passing network blip never reaches the screen. A read fails by resolving
 * null or throwing; null comes back once every attempt has failed, or as
 * soon as the signal aborts.
 */
export async function readWithRetries<T>(
  read: () => Promise<T | null>,
  signal?: AbortSignal,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<T | null> {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await pause(delays[attempt - 1]!, signal);
    if (signal?.aborted) return null;
    const data = await read().catch(() => null);
    if (data !== null) return data;
  }
  return null;
}

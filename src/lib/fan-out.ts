export async function mapByIdDroppingNulls<T>(
  ids: readonly number[],
  getter: (id: number) => Promise<T | null>,
): Promise<Map<number, T>> {
  const entries = await Promise.all(ids.map(async (id) => [id, await getter(id)] as const));
  const map = new Map<number, T>();
  for (const [id, value] of entries) {
    if (value !== null) map.set(id, value);
  }
  return map;
}

/**
 * Runs `worker` over `items` with at most `limit` calls in flight and returns
 * the results in input order. After the first rejection no new item is
 * claimed and that error is rethrown; calls already in flight finish
 * unobserved. A worker that must not stop the batch catches its own errors.
 * A limit below 1 (or NaN) runs one call at a time.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  const run = async (): Promise<void> => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const runners = Math.min(Math.max(1, Math.floor(limit) || 1), items.length);
  await Promise.all(Array.from({ length: runners }, run));
  return results;
}

/** What {@link runUntilDeadline} counted; `deferred` items were never started. */
export interface DeadlineBatchResult {
  readonly succeeded: number;
  readonly failed: number;
  readonly deferred: number;
}

/**
 * Works through `items` one at a time until `deadline` (epoch ms), so one
 * item's failure never stops the rest. The deadline is checked before each
 * item starts, so a running item always finishes; the first item checked at
 * or past the deadline and every item after it are counted deferred. `work`
 * resolving 'failed' counts a failure without calling `onError`, 'skipped'
 * counts nothing, and anything else counts a success. A throw counts a
 * failure and then awaits `onError`; a throw from `onError` (a retry rotate
 * that could not be written) stops the run.
 */
export async function runUntilDeadline<T>(
  items: readonly T[],
  deadline: number,
  work: (item: T) => Promise<'succeeded' | 'failed' | 'skipped' | void>,
  onError: (item: T, error: unknown) => void | Promise<void>,
): Promise<DeadlineBatchResult> {
  let succeeded = 0;
  let failed = 0;
  for (const [index, item] of items.entries()) {
    if (Date.now() >= deadline) return { succeeded, failed, deferred: items.length - index };
    let outcome;
    try {
      outcome = await work(item);
    } catch (error) {
      failed += 1;
      await onError(item, error);
      continue;
    }
    if (outcome === 'failed') failed += 1;
    else if (outcome !== 'skipped') succeeded += 1;
  }
  return { succeeded, failed, deferred: 0 };
}

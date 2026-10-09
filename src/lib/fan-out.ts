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

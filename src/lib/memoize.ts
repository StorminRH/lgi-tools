/**
 * Concurrent calls with the same key share one pending promise. The entry is
 * removed when it settles, so nothing (result or rejection) is cached: the
 * next call after that loads again.
 */
export function singleFlight<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const inFlight = new Map<K, Promise<V>>();
  return (key) => {
    const pending = inFlight.get(key);
    if (pending !== undefined) return pending;
    const request = load(key).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, request);
    return request;
  };
}

/**
 * One call per argument for the life of the returned function. The promise is
 * kept before it settles and never evicted, so a rejection is shared too. Build
 * a fresh wrapper for each run or phase that should read again.
 */
export function memoizeAsync<A, R>(fn: (arg: A) => Promise<R>): (arg: A) => Promise<R> {
  const pending = new Map<A, Promise<R>>();
  return (arg) => {
    const hit = pending.get(arg);
    if (hit !== undefined) return hit;
    const result = fn(arg);
    pending.set(arg, result);
    return result;
  };
}

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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One scoped source's results for a field as it is typed: debounced, and a
 * newer query cancels the one still in flight.
 */
export function useSourceSearch<T>(
  query: string,
  search: (query: string, signal: AbortSignal) => Promise<T[]>,
  debounceMs: number,
): T[] {
  const [hits, setHits] = useState<T[]>([]);
  const ctrlRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (input: string) => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const results = await search(input, ctrl.signal).catch(() => null);
      if (results === null || ctrl.signal.aborted) return;
      setHits(results);
    },
    [search],
  );

  useEffect(() => {
    const timer = setTimeout(() => void run(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, run, debounceMs]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return hits;
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchOneSource, type SearchResult } from './index';

/**
 * One scoped source's results for a field as it is typed: debounced, and a
 * newer query cancels the one still in flight.
 */
export function useSourceSearch(query: string, sourceId: string, debounceMs: number): SearchResult[] {
  const [hits, setHits] = useState<SearchResult[]>([]);
  const ctrlRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (input: string) => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const results = await searchOneSource(input, sourceId, ctrl.signal).catch(() => null);
      if (results === null || ctrl.signal.aborted) return;
      setHits(results);
    },
    [sourceId],
  );

  useEffect(() => {
    const timer = setTimeout(() => void run(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, run, debounceMs]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return hits;
}

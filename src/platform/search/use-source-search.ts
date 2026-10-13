'use client';

import { useEffect, useRef, useState } from 'react';

/** A search's settled result, tagged with the query it answered. */
export interface SearchAnswer<R> {
  readonly query: string;
  readonly result: R;
}

/** The hits before any answer, one list for every field so memos over them hold. */
const NO_HITS: never[] = [];
Object.freeze(NO_HITS);

/**
 * The latest settled answer for a field as it is typed, tagged with the query
 * it answered, so a caller can tell whether it answers what the field holds
 * now. The search runs once the query has held for `debounceMs`; a newer run
 * aborts the one still in flight, and so does unmounting. A search that
 * rejects, or settles after its run was aborted, leaves the previous answer.
 */
export function useSearchAnswer<R>(
  query: string,
  search: (query: string, signal: AbortSignal) => Promise<R>,
  debounceMs: number,
): SearchAnswer<R> | null {
  const [answer, setAnswer] = useState<SearchAnswer<R> | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      void search(query, ctrl.signal).then(
        (result) => {
          if (!ctrl.signal.aborted) setAnswer({ query, result });
        },
        () => undefined,
      );
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, search, debounceMs]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return answer;
}

/**
 * The latest hits for a field as it is typed, from one scoped source or from
 * every source at once: useSearchAnswer's result, whichever query it answered,
 * and one shared empty list before the first answer.
 */
export function useSourceSearch<T>(
  query: string,
  search: (query: string, signal: AbortSignal) => Promise<T[]>,
  debounceMs: number,
): T[] {
  return useSearchAnswer(query, search, debounceMs)?.result ?? NO_HITS;
}

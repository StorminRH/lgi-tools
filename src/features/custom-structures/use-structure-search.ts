'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchOneSource } from '@/platform/search';
import type { StructureSearchResult } from './api-contract';
import { structureSearchHit } from './structure-search-source';

const SEARCH_DEBOUNCE_MS = 250;

/** Structures matching `query` from the scoped `structures` search source. */
export function useStructureSearch(query: string): StructureSearchResult[] {
  const [hits, setHits] = useState<StructureSearchResult[]>([]);
  const ctrlRef = useRef<AbortController | null>(null);

  const run = useCallback(async (input: string) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const results = await searchOneSource(input, 'structures', ctrl.signal).catch(() => null);
    if (results === null || ctrl.signal.aborted) return;
    setHits(results.flatMap((r) => structureSearchHit(r.id) ?? []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void run(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return hits;
}

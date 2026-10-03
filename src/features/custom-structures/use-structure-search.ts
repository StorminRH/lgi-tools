'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_STRUCTURE_SEARCH_LENGTH, type StructureSearchResult } from './api-contract';
import { searchStructures } from './structure-search-client';

const SEARCH_DEBOUNCE_MS = 250;

/** Structures matching `query` that the pilot's characters can dock at. Calls ESI, so it waits for a pause in typing. */
export function useStructureSearch(query: string): StructureSearchResult[] {
  const [hits, setHits] = useState<StructureSearchResult[]>([]);
  const ctrlRef = useRef<AbortController | null>(null);

  const run = useCallback(async (input: string) => {
    ctrlRef.current?.abort();
    const search = input.trim();
    if (search.length < MIN_STRUCTURE_SEARCH_LENGTH) return setHits([]);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const found = await searchStructures(search, ctrl.signal);
    if (!ctrl.signal.aborted) setHits(found);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void run(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return hits;
}

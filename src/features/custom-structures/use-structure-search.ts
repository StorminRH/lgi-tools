'use client';

import { useMemo } from 'react';
import { useSourceSearch } from '@/platform/search/use-source-search';
import type { StructureSearchResult } from './api-contract';
import { structureSearchHit } from './structure-search-source';

const SEARCH_DEBOUNCE_MS = 250;

/** Structures matching `query` from the scoped `structures` search source. */
export function useStructureSearch(query: string): StructureSearchResult[] {
  const results = useSourceSearch(query, 'structures', SEARCH_DEBOUNCE_MS);
  return useMemo(() => results.flatMap((r) => structureSearchHit(r.id) ?? []), [results]);
}

'use client';

import { useSourceSearch } from '@/platform/search/use-source-search';
import { MIN_STRUCTURE_SEARCH_LENGTH, type StructureSearchResult } from './api-contract';
import { searchStructures } from './structure-search-client';

const SEARCH_DEBOUNCE_MS = 250;

async function search(query: string, signal: AbortSignal): Promise<StructureSearchResult[]> {
  const input = query.trim();
  return input.length < MIN_STRUCTURE_SEARCH_LENGTH ? [] : searchStructures(input, signal);
}

/** Structures matching `query` that the pilot's characters can dock at. Calls ESI, so it waits for a pause in typing. */
export function useStructureSearch(query: string): StructureSearchResult[] {
  return useSourceSearch(query, search, SEARCH_DEBOUNCE_MS);
}

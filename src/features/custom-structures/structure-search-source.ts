import type { SearchSource } from '@/platform/search';
import { apiFetch } from '@/transport/api-client';
import {
  MIN_STRUCTURE_SEARCH_LENGTH,
  searchStructuresEndpoint,
  type StructureSearchResult,
} from './api-contract';

const hits = new Map<string, StructureSearchResult>();

/** The full structure behind a result this source returned. */
export function structureSearchHit(resultId: string): StructureSearchResult | undefined {
  return hits.get(resultId);
}

/**
 * Upwell structures the pilot's characters can dock at, by name. Scoped-only:
 * it calls ESI per keystroke, so the header search never reaches it.
 */
export const structuresSearchSource: SearchSource = {
  id: 'structures',
  name: 'Structures',
  limit: 8,
  excludeFromDefaultScope: true,
  async search(query, ctx) {
    const search = query.trim();
    if (search.length < MIN_STRUCTURE_SEARCH_LENGTH) return [];
    const res = await apiFetch(searchStructuresEndpoint, {
      body: { search },
      cache: 'no-store',
      signal: ctx.signal,
    });
    if (!res.ok) return [];
    return res.data.results.map((hit) => {
      const id = `structure:${hit.structureId}`;
      hits.set(id, hit);
      return { kind: 'structure', id, label: hit.name, href: '#', typeId: hit.structureTypeId ?? undefined };
    });
  },
};

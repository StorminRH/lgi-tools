import { apiFetch } from '@/transport/api-client';
import { searchStructuresEndpoint, type StructureSearchResult } from './api-contract';

/** Structures whose name contains `search`; none when the request fails. */
export async function searchStructures(search: string, signal: AbortSignal): Promise<StructureSearchResult[]> {
  const res = await apiFetch(searchStructuresEndpoint, { body: { search }, cache: 'no-store', signal });
  return res.ok ? res.data.results : [];
}

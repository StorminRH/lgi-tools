import { createClientResource } from '@/lib/client-resource';
import { apiFetchData } from '@/transport/api-fetch-data';
import { matchesAllWords } from '@/platform/search/match';
import { stationsEndpoint } from './api-contract';

export interface StationSearchEntry {
  id: number;
  name: string;
  systemId: number;
  security: number | null;
}

/** The manufacturing station index, read once per page and kept. */
export const stationsResource = createClientResource(
  async (): Promise<StationSearchEntry[]> => (await apiFetchData(stationsEndpoint, 'station index')).stations,
);

/**
 * Stations whose name holds every word typed, in any order: the system name
 * leads every station name, so "jita navy" finds the Caldari Navy plant in
 * Jita. Names that start with the query come first.
 */
export function matchStations(
  stations: readonly StationSearchEntry[],
  query: string,
  limit: number,
): StationSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const hits = stations.filter((s) => matchesAllWords(s.name, q));
  const leads = (s: StationSearchEntry) => (s.name.toLowerCase().startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => leads(a) - leads(b)).slice(0, limit);
}

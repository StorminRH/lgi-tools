import { createClientResource } from '@/lib/client-resource';
import { apiFetchData } from '@/transport/api-fetch-data';
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
  const words = q.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const hits = stations.filter((s) => {
    const name = s.name.toLowerCase();
    return words.every((w) => name.includes(w));
  });
  const leads = (s: StationSearchEntry) => (s.name.toLowerCase().startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => leads(a) - leads(b)).slice(0, limit);
}

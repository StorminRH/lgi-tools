import { createClientResource } from '@/lib/client-resource';
import { apiFetchData } from '@/transport/api-fetch-data';
import { fuzzyMatch } from '@/platform/search/match';
import type { SearchSource } from '@/platform/search';
import { indexedFuzzySearch } from '@/platform/search/rank';
import { systemsEndpoint } from './api-contract';
import { formatSecurityStatus } from './security';

export interface SystemSearchEntry {
  id: number;
  name: string;
  security: number | null;
}

async function readSystemIndex(): Promise<{
  readonly systems: SystemSearchEntry[];
  readonly byId: ReadonlyMap<number, SystemSearchEntry>;
}> {
  const { systems } = await apiFetchData(systemsEndpoint, 'system index');
  return { systems, byId: new Map(systems.map((system) => [system.id, system])) };
}

/**
 * The system index for this page, as a list and keyed by id. Both are built
 * once per load, so their identities hold for as long as the index does, and
 * any caller's load reaches every reader.
 */
export const systemsResource = createClientResource(readSystemIndex);

/** The system behind an id, or null with no id, no index yet, or no such system. */
export function lookupSystem(
  systemsById: ReadonlyMap<number, SystemSearchEntry> | null,
  systemId: number | null,
): SystemSearchEntry | null {
  if (systemId === null || systemsById === null) return null;
  return systemsById.get(systemId) ?? null;
}

export function matchSystem(systems: SystemSearchEntry[], input: string): SystemSearchEntry | null {
  const q = input.trim().toLowerCase();
  if (q.length === 0) return null;
  let best: SystemSearchEntry | null = null;
  let bestScore = -1;
  for (const s of systems) {
    const name = s.name.toLowerCase();
    if (name === q) return s;
    if (!name.startsWith(q)) continue;
    const score = fuzzyMatch(input, s.name)?.score ?? 0;
    if (score > bestScore || (score === bestScore && best !== null && s.name.localeCompare(best.name) < 0)) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

const searchSystems = indexedFuzzySearch({
  load: async () => (await systemsResource.load()).systems,
  label: (entry) => entry.name,
  toResult: (entry, match) => ({
    kind: 'system',
    id: `system:${entry.id}`,
    label: entry.name,
    sub: formatSecurityStatus(entry.security),
    href: '#',
    matchIndices: match.matchIndices,
  }),
});

/** System names for a form field's suggestions; the global search leaves systems out. */
export const systemsSource: SearchSource = {
  id: 'systems',
  name: 'Systems',
  limit: 10,
  search: searchSystems,
};

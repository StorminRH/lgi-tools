import { apiFetch } from '@/transport/api-client';
import type { SearchSource } from '@/platform/search';
import { fuzzyMatch } from '@/platform/search/match';
import { rankFuzzyResults } from '@/platform/search/rank';
import { systemsEndpoint } from './api-contract';
import { roundSecurityStatus } from './security';

export interface SystemSearchEntry {
  id: number;
  name: string;
  security: number | null;
}

const MAX_RESULTS = 20;

let indexPromise: Promise<SystemSearchEntry[]> | null = null;
let loadedIndex: SystemSearchEntry[] | null = null;

export function loadSystems(): Promise<SystemSearchEntry[]> {
  if (!indexPromise) {
    indexPromise = apiFetch(systemsEndpoint)
      .then((result) => {
        if (!result.ok) {
          const reason = 'status' in result ? result.status : result.kind;
          throw new Error(`system index ${reason}`);
        }
        loadedIndex = result.data.systems;
        return loadedIndex;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

export function getLoadedSystems(): SystemSearchEntry[] | null {
  return loadedIndex;
}

export function formatSec(sec: number | null): string {
  return sec === null ? '—' : roundSecurityStatus(sec).toFixed(1);
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

export const systemsSource: SearchSource = {
  id: 'systems',
  name: 'Systems',
  limit: 10,
  excludeFromDefaultScope: true,
  async search(query, ctx) {
    if (query.length === 0) return [];

    const index = await loadSystems();
    if (ctx.signal?.aborted) return [];

    return rankFuzzyResults(
      index,
      query,
      (entry) => entry.name,
      (entry, match) => ({
        kind: 'system',
        id: `system:${entry.id}`,
        label: entry.name,
        sub: formatSec(entry.security),
        href: '#',
        matchIndices: match.matchIndices,
      }),
      { limit: MAX_RESULTS },
    );
  },
};

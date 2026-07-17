// The universe system-search core (3.7.13.2) — the shared basis for the
// `systems` search source and every system picker (the planner's two
// build-location slots, the custom-structure pin control). Lives in the
// eve-data slice because TWO features consume it and features never import
// each other; both may import a data slice. The `@/search` type/matcher
// imports are the proven data→engine edge (the tools/commands precedent).
//
// The index is the full persistent universe (~8.6k systems: K-space, Pochven,
// J-space), fetched once from /api/industry/systems and memoized for the
// session (the blueprints-source idiom). The synchronous snapshot getter lets
// the sync consumers (TerminalSearch `parse`, the deduce-lock lookups) read
// the same retried index the async search path fills — one loader, so a
// transient mount-time fetch failure can't leave suggestions working while
// parse stays permanently empty.

import { apiFetch } from '@/lib/api-client';
import type { SearchSource } from '@/search';
import { fuzzyMatch } from '@/search/match';
import { rankFuzzyResults } from '@/search/rank';
import { systemsEndpoint } from './api-contract';

/**
 * One searchable solar system — the wire shape for /api/industry/systems.
 * `security` is the raw −1.0..1.0 status, null when the SDE leaves it untagged.
 */
export interface SystemSearchEntry {
  id: number;
  name: string;
  security: number | null;
}

// Cap the rows handed back per keystroke; the registry caps again at the
// source's `limit`, this just bounds the map/sort work for a loose query.
const MAX_RESULTS = 20;

let indexPromise: Promise<SystemSearchEntry[]> | null = null;
let loadedIndex: SystemSearchEntry[] | null = null;

/**
 * Session-memoized lazy fetch of the system index. No AbortSignal on this
 * shared fetch: binding it to the first caller's signal would let a later
 * keystroke aborting the prior one reject the index for everyone — per-
 * keystroke cancellation is the post-await `ctx.signal?.aborted` check in
 * search(). Cleared on failure so a later call retries rather than caching a
 * rejected promise for the whole session.
 */
export function loadSystems(): Promise<SystemSearchEntry[]> {
  if (!indexPromise) {
    indexPromise = apiFetch(systemsEndpoint)
      .then((result) => {
        if (!result.ok) throw new Error(`system index ${result.status}`);
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

/**
 * The already-loaded index, or null before the first successful load. Sync
 * readers (parse, deduce-lock lookups) share the async search path's loader
 * through this, so a failed mount-time load heals via the same retry.
 */
export function getLoadedSystems(): SystemSearchEntry[] | null {
  return loadedIndex;
}

/** The display form of a system's security status, shared by the location slots. */
export function formatSec(sec: number | null): string {
  return sec === null ? '—' : sec.toFixed(1);
}

/**
 * Resolve free text to ONE system (the pickers' Enter-to-submit path) — exact
 * resolution over the loaded index, not a second search: the ranked fuzzy
 * search lives in the source below. An exact name match (unique in EVE) wins;
 * otherwise the highest fuzzy-scored PREFIX match, alphabetical on ties. The
 * fuzzy rank matters on the full universe: thousands of J###### wormhole names
 * sort before every alphabetic J-name, so "first prefix match in sort order"
 * would send `j` + Enter to a random J1xxxxx instead of a short K-space name.
 */
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

/**
 * The lazily-loaded Systems search source (id `systems`). Excluded from the
 * DEFAULT scope (see ./search.ts): SearchResult.href is required but no system
 * page exists, so `href` is an inert placeholder — the scoped picker consumers
 * read `label`/`id` only. Give systems a real destination page before ever
 * letting this source into the global command bar.
 */
export const systemsSource: SearchSource = {
  id: 'systems',
  name: 'Systems',
  limit: 10,
  excludeFromDefaultScope: true,
  async search(query, ctx) {
    // Never list the whole universe on an empty query.
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

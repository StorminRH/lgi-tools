// Lazy-loaded Blueprints search source. Code-split behind the registry's
// `registerLazySearchSource` (see ./search.ts), so neither this matcher nor the
// ~5k-entry index rides the initial bundle — both arrive on the user's first
// blueprint keystroke. The index is fetched once from /api/industry/blueprints
// and memoized for the session.

import { apiFetch } from '@/transport/api-client';
import { blueprintImage } from '@/data/eve-data/type-images';
import type { SearchSource } from '@/search';
import { rankFuzzyResults } from '@/search/rank';
import { blueprintsEndpoint } from './api-contract';
import type { BlueprintIndexEntry } from './types';

// Cap the rows handed back per keystroke; the registry caps again at the
// source's `limit`, this just bounds the map/sort work for a loose query.
const MAX_RESULTS = 20;

let indexPromise: Promise<BlueprintIndexEntry[]> | null = null;

function loadIndex(): Promise<BlueprintIndexEntry[]> {
  if (!indexPromise) {
    // No AbortSignal on this shared fetch: the promise is memoized for the
    // session, so binding it to the first caller's signal would let a later
    // keystroke aborting the prior one reject the index for everyone. Per-
    // keystroke cancellation is handled by the post-await `ctx.signal?.aborted`
    // check in search(). Clear the cache on failure so a later keystroke
    // retries rather than caching a rejected promise for the whole session.
    indexPromise = apiFetch(blueprintsEndpoint)
      .then((result) => {
        if (!result.ok) throw new Error(`blueprint index ${result.status}`);
        return result.data.blueprints;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

/** Global-search data source that maps the cached blueprint catalogue into planner search results. */
export const blueprintsSource: SearchSource = {
  id: 'blueprints',
  name: 'Blueprints',
  limit: 6,
  async search(query, ctx) {
    // Never list all ~5k on an empty query — blueprints only surface once the
    // user has typed something to match.
    if (query.length === 0) return [];

    const index = await loadIndex();
    if (ctx.signal?.aborted) return [];

    return rankFuzzyResults(
      index,
      query,
      (entry) => entry.name,
      (entry, match) => ({
        kind: 'blueprint',
        id: `blueprint:${entry.blueprintTypeId}`,
        label: entry.name,
        sub: 'Blueprint',
        href: `/industry/${entry.blueprintTypeId}`,
        icon: blueprintImage(entry.blueprintTypeId),
        // Retain product identity for ranking and persisted-recents compatibility;
        // the resolved blueprint descriptor above owns what the row displays.
        typeId: entry.productTypeId,
        matchIndices: match.matchIndices,
      }),
      { limit: MAX_RESULTS },
    );
  },
};

// Lazy-loaded Blueprints search source. Code-split behind the registry's
// `registerLazySearchSource` (see ./search.ts), so neither this matcher nor the
// ~5k-entry index rides the initial bundle — both arrive on the user's first
// blueprint keystroke. The index is fetched once from /api/industry/blueprints
// and memoized for the session.

import { apiFetch } from '@/lib/api-client';
import type { SearchResult, SearchSource } from '@/search';
import { fuzzyMatch, type FuzzyMatch } from '@/search/match';
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

export const blueprintsSource: SearchSource = {
  name: 'Blueprints',
  limit: 6,
  async search(query, ctx) {
    // Never list all ~5k on an empty query — blueprints only surface once the
    // user has typed something to match.
    if (query.length === 0) return [];

    const index = await loadIndex();
    if (ctx.signal?.aborted) return [];

    const matches: { entry: BlueprintIndexEntry; match: FuzzyMatch }[] = [];
    for (const entry of index) {
      const match = fuzzyMatch(query, entry.name);
      if (match) matches.push({ entry, match });
    }
    matches.sort((a, b) => b.match.score - a.match.score);

    return matches.slice(0, MAX_RESULTS).map<SearchResult>(({ entry, match }) => ({
      kind: 'blueprint',
      id: `blueprint:${entry.blueprintTypeId}`,
      label: entry.name,
      sub: 'Blueprint',
      href: `/industry/${entry.blueprintTypeId}`,
      // A blueprint always maps to a real product, so the row always renders that
      // product's icon (TypeIcon). No generic 'BP' glyph — if the image ever 404s
      // the fallback derives the monogram from the item name, never a flat "BP".
      typeId: entry.productTypeId,
      matchIndices: match.matchIndices,
    }));
  },
};

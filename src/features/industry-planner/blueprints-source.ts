import { apiFetch } from '@/transport/api-client';
import { blueprintImage } from '@/data/eve-data/type-images';
import type { SearchResult, SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';
import { blueprintsEndpoint } from './api-contract';
import type { RecentBlueprint } from './recent-blueprints';
import type { BlueprintIndexEntry } from './types';

const MAX_RESULTS = 20;
const RESULT_ID_PREFIX = 'blueprint:';

/** The blueprint a search result opens, or null for a result from another source. */
export function blueprintRefOf(result: SearchResult): RecentBlueprint | null {
  if (!result.id.startsWith(RESULT_ID_PREFIX) || result.typeId === undefined) return null;
  const typeId = Number(result.id.slice(RESULT_ID_PREFIX.length));
  if (!Number.isInteger(typeId) || typeId <= 0) return null;
  return { typeId, productTypeId: result.typeId, name: result.label };
}

let indexPromise: Promise<BlueprintIndexEntry[]> | null = null;

function loadIndex(): Promise<BlueprintIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = apiFetch(blueprintsEndpoint)
      .then((result) => {
        if (!result.ok) {
          const reason = 'status' in result ? result.status : result.kind;
          throw new Error(`blueprint index ${reason}`);
        }
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
  id: 'blueprints',
  name: 'Blueprints',
  limit: 6,
  async search(query, ctx) {
    if (query.length === 0) return [];

    const index = await loadIndex();
    if (ctx.signal?.aborted) return [];

    return rankFuzzyResults(
      index,
      query,
      (entry) => entry.name,
      (entry, match) => ({
        kind: 'blueprint',
        id: `${RESULT_ID_PREFIX}${entry.blueprintTypeId}`,
        label: entry.name,
        sub: 'Blueprint',
        href: `/industry/${entry.blueprintTypeId}`,
        icon: blueprintImage(entry.blueprintTypeId),
        typeId: entry.productTypeId,
        matchIndices: match.matchIndices,
      }),
      { limit: MAX_RESULTS },
    );
  },
};

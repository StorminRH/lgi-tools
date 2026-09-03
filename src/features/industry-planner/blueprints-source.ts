import { apiFetch } from '@/transport/api-client';
import { blueprintImage } from '@/data/eve-data/type-images';
import type { SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';
import { blueprintsEndpoint } from './api-contract';
import type { BlueprintIndexEntry } from './types';

const MAX_RESULTS = 20;

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
        id: `blueprint:${entry.blueprintTypeId}`,
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

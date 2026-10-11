import { createClientResource } from '@/lib/client-resource';
import { apiFetchData } from '@/transport/api-fetch-data';
import { blueprintImage } from '@/data/eve-data/type-images';
import type { SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';
import { blueprintsEndpoint } from './api-contract';
import type { BlueprintIndexEntry } from './types';

const MAX_RESULTS = 20;

// No reader subscribes, so a failed load is simply read again by the next search.
const blueprintIndex = createClientResource(
  async (): Promise<BlueprintIndexEntry[]> => (await apiFetchData(blueprintsEndpoint, 'blueprint index')).blueprints,
);

export const searchBlueprints: SearchSource['search'] = async (query, ctx) => {
  if (query.length === 0) return [];

  const index = await blueprintIndex.load();
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
};

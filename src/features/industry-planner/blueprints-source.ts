import { createClientResource } from '@/lib/client-resource';
import { apiFetchData } from '@/transport/api-fetch-data';
import { blueprintImage } from '@/data/eve-data/type-images';
import { indexedFuzzySearch } from '@/platform/search/rank';
import { blueprintsEndpoint } from './api-contract';
import type { BlueprintIndexEntry } from './types';

// No reader subscribes, so a failed load is simply read again by the next search.
const blueprintIndex = createClientResource(
  async (): Promise<BlueprintIndexEntry[]> => (await apiFetchData(blueprintsEndpoint, 'blueprint index')).blueprints,
);

export const searchBlueprints = indexedFuzzySearch({
  load: blueprintIndex.load,
  label: (entry) => entry.name,
  toResult: (entry, match) => ({
    kind: 'blueprint',
    id: `blueprint:${entry.blueprintTypeId}`,
    label: entry.name,
    sub: 'Blueprint',
    href: `/industry/${entry.blueprintTypeId}`,
    icon: blueprintImage(entry.blueprintTypeId),
    typeId: entry.productTypeId,
    matchIndices: match.matchIndices,
  }),
});

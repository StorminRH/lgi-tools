'use client';

import { ENTITY_NAMES_MAX_IDS, entityNamesEndpoint } from '@/data/eve-data/api-contract';
import { createNamesClient } from '@/data/eve-data/names-client';
import { useNames } from '@/data/eve-data/use-names';

const entityNamesClient = createNamesClient(entityNamesEndpoint, {
  maxIds: ENTITY_NAMES_MAX_IDS,
  cache: false,
});

export function useEntityNames(entityIds: readonly number[]): Record<string, string> {
  return useNames(entityIds, entityNamesClient);
}

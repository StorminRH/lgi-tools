import { TYPE_NAMES_MAX_IDS, typeNamesEndpoint } from './api-contract';
import { createNamesClient } from './names-client';

export const typeNamesClient = createNamesClient(typeNamesEndpoint, {
  maxIds: TYPE_NAMES_MAX_IDS,
  cache: true,
  retryMs: 15_000,
});

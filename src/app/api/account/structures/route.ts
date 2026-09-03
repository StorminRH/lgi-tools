import { getStructureTypes, getTypeAttributesBatch } from '@/data/eve-data/queries';
import { getAvailableCorpStructuresForUser } from '@/composition/sync/corp-structures-sync';
import { listCustomStructures } from '@/features/custom-structures/queries';
import { availableStructuresEndpoint } from '@/features/industry-planner/api-contract';
import {
  buildAvailableStructures,
  collectDogmaTypeIds,
} from '@/features/industry-planner/available-structures';
import { getCurrentUserId } from '@/composition/session';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return apiResponse(availableStructuresEndpoint, 200, { structures: [] });

  const [custom, corp, structureTypes] = await Promise.all([
    listCustomStructures(userId),
    getAvailableCorpStructuresForUser(userId),
    getStructureTypes(),
  ]);
  if (custom.length === 0 && corp.length === 0) {
    return apiResponse(availableStructuresEndpoint, 200, { structures: [] });
  }

  const dogma = await getTypeAttributesBatch(collectDogmaTypeIds(custom, corp));
  const structures = buildAvailableStructures(custom, corp, structureTypes, dogma);
  return apiResponse(availableStructuresEndpoint, 200, { structures });
}

import { getCorpStructuresForUserOnView } from '@/composition/sync/corp-structures-sync';
import { getCurrentUserId } from '@/composition/session';
import { corpStructuresEndpoint } from '@/features/owned-structures/api-contract';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(corpStructuresEndpoint, 200, { corporations: [] });
  }
  const result = await getCorpStructuresForUserOnView(userId);
  return apiResponse(corpStructuresEndpoint, 200, result);
}

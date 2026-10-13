import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { getCurrentUserId } from '@/composition/session';
import { corpStructuresEndpoint } from '@/features/owned-structures/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return apiResponse(corpStructuresEndpoint, 200, { corporations: [], refreshing: false });
  const result = await measureOwnedDataRead({
    endpoint: corpStructuresEndpoint,
    read: () => getCorpStructuresPageData(userId),
    returned: (value) => value.corporations.length,
  });
  return apiResponse(corpStructuresEndpoint, 200, result);
}

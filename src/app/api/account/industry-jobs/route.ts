import { getJobsForUserOnView } from '@/composition/sync/industry-jobs-sync';
import { getCurrentUserId } from '@/platform/auth/session';
import { industryJobsEndpoint } from '@/features/industry-jobs/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(industryJobsEndpoint, 200, { characters: [], names: {} });
  }
  const result = await measureOwnedDataRead({
    endpoint: '/api/account/industry-jobs',
    read: () => getJobsForUserOnView(userId),
    returned: (value) => value.characters.length,
  });
  return apiResponse(industryJobsEndpoint, 200, result);
}

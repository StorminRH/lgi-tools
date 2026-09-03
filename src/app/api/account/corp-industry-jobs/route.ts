import { getCorpJobsForUserOnView } from '@/composition/sync/corp-industry-jobs-sync';
import { getCurrentUserId } from '@/composition/session';
import { corpIndustryJobsEndpoint } from '@/features/industry-jobs/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(corpIndustryJobsEndpoint, 200, { corporations: [], names: {} });
  }
  const result = await measureOwnedDataRead({
    endpoint: '/api/account/corp-industry-jobs',
    read: () => getCorpJobsForUserOnView(userId),
    returned: (value) => value.corporations.length,
  });
  return apiResponse(corpIndustryJobsEndpoint, 200, result);
}

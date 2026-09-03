import { systemsEndpoint } from '@/data/eve-data/api-contract';
import { getSystemSearchIndex } from '@/data/eve-data/queries';
import { apiResponse } from '@/transport/api-response';

// authz: public
// input: none
export async function GET(): Promise<Response> {
  const systems = await getSystemSearchIndex();
  return apiResponse(systemsEndpoint, 200, { systems });
}

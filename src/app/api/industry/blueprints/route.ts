import { blueprintsEndpoint } from '@/features/industry-planner/api-contract';
import { getBlueprintSearchIndex } from '@/features/industry-planner/queries';
import { apiResponse } from '@/transport/api-response';

// authz: public
// input: none
export async function GET(): Promise<Response> {
  const blueprints = await getBlueprintSearchIndex();
  return apiResponse(blueprintsEndpoint, 200, { blueprints });
}

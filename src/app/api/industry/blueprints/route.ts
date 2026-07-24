import { blueprintsEndpoint } from '@/features/industry-planner/api-contract';
import { getBlueprintSearchIndex } from '@/features/industry-planner/queries';
import { apiResponse } from '@/transport/api-response';

/**
 * GET /api/industry/blueprints
 * No user input — returns the full cached blueprint search index that feeds the
 * lazy Blueprints search source. (Validation invariant: no input to validate.)
 */
// authz: public
// input: none
export async function GET(): Promise<Response> {
  const blueprints = await getBlueprintSearchIndex();
  return apiResponse(blueprintsEndpoint, 200, { blueprints });
}

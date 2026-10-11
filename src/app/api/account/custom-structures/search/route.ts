import { runMutationRoute } from '@/app/api/mutation-route';
import { searchUpwellStructures } from '@/composition/structure-search';
import {
  searchStructuresEndpoint,
  searchStructuresRequestSchema,
} from '@/features/custom-structures/api-contract';
import { dependencyUnavailableFailure } from '@/lib/failure';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.search-structures',
    endpoint: searchStructuresEndpoint,
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, searchStructuresRequestSchema),
    handle: async ({ userId }, body) => {
      try {
        const results = await searchUpwellStructures(userId, body.search, request.signal);
        return apiResponse(searchStructuresEndpoint, 200, { results });
      } catch (cause) {
        return apiResponse(
          searchStructuresEndpoint,
          503,
          dependencyUnavailableFailure('structure_search_unavailable', 503, {
            cause,
            detail: 'EVE structure search is temporarily unavailable',
          }),
        );
      }
    },
  });
}

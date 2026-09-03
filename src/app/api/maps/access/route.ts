import { runMutationRoute } from '@/app/api/mutation-route';
import { applyMapAccessUpdate } from '@/composition/map-access-update';
import {
  updateMapAccessEndpoint,
  updateMapAccessRequestSchema,
} from '@/data/maps/api-contract';
import { dependencyUnavailableFailure, forbiddenFailure } from '@/lib/failure';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.update-access',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, updateMapAccessRequestSchema),
    handle: async ({ userId }, body) => {
      const result = await applyMapAccessUpdate(userId, body);
      if (!result.ok && result.reason === 'forbidden') {
        return apiResponse(
          updateMapAccessEndpoint,
          403,
          forbiddenFailure('map_admin_required', 'Map admin access is required'),
        );
      }
      if (!result.ok) {
        return apiResponse(
          updateMapAccessEndpoint,
          503,
          dependencyUnavailableFailure('map_projection_unavailable', 503, {
            cause: result.cause,
            detail: 'Map access projection is temporarily unavailable',
          }),
        );
      }
      return apiResponse(updateMapAccessEndpoint, 204);
    },
  });
}

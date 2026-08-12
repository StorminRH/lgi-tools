import { runMutationRoute } from '@/app/api/mutation-route';
import { deleteMapForUser } from '@/composition/map-lifecycle';
import {
  deleteMapEndpoint,
  mapLifecycleRequestSchema,
} from '@/data/maps/api-contract';
import { forbiddenFailure } from '@/lib/failure';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/** Archives one admin-authorized map and tears down its live access projection. */
// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.delete-map',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, mapLifecycleRequestSchema),
    handle: async ({ userId }, body) => {
      const result = await deleteMapForUser(userId, body);
      return result.ok
        ? apiResponse(deleteMapEndpoint, 204)
        : apiResponse(
            deleteMapEndpoint,
            403,
            forbiddenFailure('map_admin_required', 'Map admin access is required'),
          );
    },
  });
}

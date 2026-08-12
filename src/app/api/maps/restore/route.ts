import { runMutationRoute } from '@/app/api/mutation-route';
import { restoreMapForUser } from '@/composition/map-lifecycle';
import {
  mapLifecycleRequestSchema,
  restoreMapEndpoint,
} from '@/data/maps/api-contract';
import { forbiddenFailure } from '@/lib/failure';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/** Restores one admin-authorized map while its undo window is still open. */
// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.restore-map',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, mapLifecycleRequestSchema),
    handle: async ({ userId }, body) => {
      const result = await restoreMapForUser(userId, body);
      return result.ok
        ? apiResponse(restoreMapEndpoint, 204)
        : apiResponse(
            restoreMapEndpoint,
            403,
            forbiddenFailure(
              'map_restore_unavailable',
              'This map can no longer be restored',
            ),
          );
    },
  });
}

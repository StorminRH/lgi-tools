import { runMutationRoute } from '@/app/api/mutation-route';
import { requestMapPurgeForUser } from '@/composition/map-lifecycle';
import {
  mapLifecycleRequestSchema,
  purgeMapNowEndpoint,
} from '@/data/maps/api-contract';
import { forbiddenFailure } from '@/lib/failure';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/** Creator-only grace fast-forward; the scheduled sweep remains the purge owner. */
// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.request-map-purge',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, mapLifecycleRequestSchema),
    handle: async ({ userId }, body) => {
      const result = await requestMapPurgeForUser(userId, body);
      return result.ok
        ? apiResponse(purgeMapNowEndpoint, 204)
        : apiResponse(
            purgeMapNowEndpoint,
            403,
            forbiddenFailure(
              'map_creator_required',
              'Only the map creator can permanently delete this map',
            ),
          );
    },
  });
}

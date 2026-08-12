import { runMutationRoute } from '@/app/api/mutation-route';
import { createProjectedMap } from '@/composition/map-creation';
import {
  createMapEndpoint,
  createMapRequestSchema,
} from '@/data/maps/api-contract';
import {
  dependencyUnavailableFailure,
  rateLimitedFailure,
} from '@/lib/failure';
import { rateLimit } from '@/lib/rate-limit';
import {
  checkUserId,
  type UserIdCheckResult,
} from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

const MAP_CREATE_LIMIT_PER_MINUTE = 5;

/** Authenticates, rate-limits, and atomically creates one durable map. */
// authz: auth
export async function POST(request: Request): Promise<Response> {
  let identityPromise: Promise<UserIdCheckResult> | undefined;
  const identity = () => {
    identityPromise ??= checkUserId();
    return identityPromise;
  };

  return runMutationRoute(request, {
    capability: 'maps.create-map',
    preflight: async () => {
      const gate = await identity();
      if (!gate.ok) return null;
      const limit = await rateLimit(gate.userId, {
        name: 'map-create',
        perMinute: MAP_CREATE_LIMIT_PER_MINUTE,
      });
      return limit.ok
        ? null
        : apiResponse(
            createMapEndpoint,
            429,
            rateLimitedFailure(limit.retryAfter),
          );
    },
    authorize: identity,
    parse: (incoming) => readJsonBody(incoming, createMapRequestSchema),
    handle: async ({ userId }, body) => {
      const result = await createProjectedMap(userId, body);
      if (!result.ok) {
        return apiResponse(
          createMapEndpoint,
          503,
          dependencyUnavailableFailure('map_projection_unavailable', 503, {
            cause: result.cause,
            detail: 'Map access projection is temporarily unavailable',
          }),
        );
      }
      return apiResponse(createMapEndpoint, 201, { mapId: result.mapId });
    },
  });
}

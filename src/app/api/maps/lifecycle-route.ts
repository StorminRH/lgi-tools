import { runMutationRoute } from '@/app/api/mutation-route';
import {
  deleteMapEndpoint,
  mapLifecycleRequestSchema,
  purgeMapNowEndpoint,
  restoreMapEndpoint,
  type MapLifecycleRequest,
} from '@/data/maps/api-contract';
import type { CapabilityId } from '@/data/telemetry/capability';
import { forbiddenFailure } from '@/lib/failure';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

export type MapLifecycleEndpoint =
  | typeof deleteMapEndpoint
  | typeof restoreMapEndpoint
  | typeof purgeMapNowEndpoint;

export type MapLifecycleCapability = Extract<
  CapabilityId,
  'maps.delete-map' | 'maps.restore-map' | 'maps.request-map-purge'
>;

export type MapLifecycleDenial = {
  readonly code: 'map_admin_required' | 'map_restore_unavailable' | 'map_creator_required';
  readonly detail: string;
};

/**
 * Cookie-auth map archive / restore / purge-request shell. Composition owns the
 * work; this helper owns the shared mutation stages and the 204 / 403 pair.
 */
export function runMapLifecycleRoute(
  request: Request,
  options: {
    readonly capability: MapLifecycleCapability;
    readonly endpoint: MapLifecycleEndpoint;
    readonly run: (
      userId: string,
      body: MapLifecycleRequest,
    ) => Promise<{ readonly ok: boolean }>;
    readonly forbidden: MapLifecycleDenial;
  },
): Promise<Response> {
  return runMutationRoute(request, {
    capability: options.capability,
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, mapLifecycleRequestSchema),
    handle: async ({ userId }, body) => {
      const result = await options.run(userId, body);
      return result.ok
        ? apiResponse(options.endpoint, 204)
        : apiResponse(
            options.endpoint,
            403,
            forbiddenFailure(options.forbidden.code, options.forbidden.detail),
          );
    },
  });
}

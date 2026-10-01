import { runMutationRoute } from '@/app/api/mutation-route';
import { applyMapAccessUpdate } from '@/composition/map-access-update';
import {
  updateMapAccessEndpoint,
  updateMapAccessRequestSchema,
} from '@/data/maps/api-contract';
import { conflictFailure, dependencyUnavailableFailure, forbiddenFailure } from '@/lib/failure';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

const CONFLICTS = {
  'creator-character-required': [
    'map_creator_character_required',
    'The map creator must keep at least one of their own characters on the access list',
  ],
  'block-owner': ['map_block_owner', 'This character belongs to the map owner.'],
  'block-self': ['map_block_self', "You can't block your own character."],
} as const;

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.update-access',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, updateMapAccessRequestSchema),
    handle: async ({ userId }, body) => {
      const result = await applyMapAccessUpdate(userId, body);
      if (result.ok) return apiResponse(updateMapAccessEndpoint, 204);
      if (result.reason === 'projection-unavailable') {
        return apiResponse(
          updateMapAccessEndpoint,
          503,
          dependencyUnavailableFailure('map_projection_unavailable', 503, {
            cause: result.cause,
            detail: 'Map access projection is temporarily unavailable',
          }),
        );
      }
      if (result.reason === 'forbidden') {
        return apiResponse(
          updateMapAccessEndpoint,
          403,
          forbiddenFailure('map_admin_required', 'Map admin access is required'),
        );
      }
      const [code, detail] = CONFLICTS[result.reason];
      return apiResponse(updateMapAccessEndpoint, 409, conflictFailure(code, detail));
    },
  });
}

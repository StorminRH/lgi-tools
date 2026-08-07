import { runMutationRoute } from '@/app/api/mutation-route';
import {
  jumpResolverEndpoint,
  jumpResolverRequestSchema,
} from '@/data/maps/api-contract';
import { resolveJumpRequest } from '@/composition/jump-resolver/resolver';
import { db } from '@/db';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/** Authenticates and dispatches one automatic jump or identity follow-up. */
// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.resolve-jump',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, jumpResolverRequestSchema),
    handle: async ({ userId }, body) =>
      apiResponse(
        jumpResolverEndpoint,
        200,
        await resolveJumpRequest(db, userId, body),
      ),
  });
}

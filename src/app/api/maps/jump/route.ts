import { runMutationRoute } from '@/app/api/mutation-route';
import {
  jumpResolverEndpoint,
  jumpResolverRequestSchema,
} from '@/data/maps/api-contract';
import { resolveJumpRequest } from '@/composition/jump-resolver/resolver';
import { db } from '@/db';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.resolve-jump',
    // The client gives up after 15 s and shows the failure, so it still counts.
    recordAbortedFailures: true,
    endpoint: jumpResolverEndpoint,
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

import { runMutationRoute } from '@/app/api/mutation-route';
import { resolveSignatureElimination } from '@/composition/signature-elimination/resolver';
import {
  signatureEliminationEndpoint,
  signatureEliminationRequestSchema,
} from '@/data/maps/api-contract';
import { db } from '@/db';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.eliminate-signatures',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, signatureEliminationRequestSchema),
    handle: async ({ userId }, body) =>
      apiResponse(
        signatureEliminationEndpoint,
        200,
        await resolveSignatureElimination(db, userId, body),
      ),
  });
}

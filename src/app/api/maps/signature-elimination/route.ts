import { runMutationRoute } from '@/app/api/mutation-route';
import { resolveSignatureElimination } from '@/composition/signature-elimination/resolver';
import {
  legacySignatureEliminationEndpoint,
  signatureEliminationEndpoint,
  signatureEliminationRouteRequestSchema,
} from '@/data/maps/api-contract';
import { db } from '@/db';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.eliminate-signatures',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, signatureEliminationRouteRequestSchema),
    handle: async ({ userId }, body) => {
      if ('systemIds' in body) {
        return apiResponse(
          signatureEliminationEndpoint,
          200,
          await resolveSignatureElimination(db, userId, body),
        );
      }
      const response = await resolveSignatureElimination(db, userId, {
        mapId: body.mapId,
        systemIds: [body.systemId],
      });
      const result = response.results[0];
      if (result === undefined) throw new Error('Signature elimination returned no system result');
      if (result.status === 'observations-unavailable') {
        return apiResponse(legacySignatureEliminationEndpoint, 503, {
          category: 'dependency_unavailable',
          code: 'observations_unavailable',
        });
      }
      return result.status === 'applied'
        ? apiResponse(legacySignatureEliminationEndpoint, 200, {
            status: 'applied',
            signatureIds: result.signatureIds,
          })
        : apiResponse(legacySignatureEliminationEndpoint, 200, { status: result.status });
    },
  });
}

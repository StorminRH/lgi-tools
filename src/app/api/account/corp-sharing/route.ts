import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { directorGate } from '@/composition/corp-role-gates';
import { checkSession } from '@/composition/route-guards';
import { setCorpDataSharingEndpoint, setCorpDataSharingRequestSchema } from '@/platform/auth/api-contract';
import { setCorpSharing } from '@/platform/auth/corp-sharing-store';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.set-corp-data-sharing',
    endpoint: setCorpDataSharingEndpoint,
    authorize: checkSession,
    parse: (incoming) => readJsonBody(incoming, setCorpDataSharingRequestSchema),
    handle: async ({ session }, { corporationId, enabled }) => {
      const director = await directorGate(session.user.id, corporationId);
      if (!director.ok) {
        return apiResponse(setCorpDataSharingEndpoint, 403, director.failure);
      }

      await setCorpSharing(corporationId, enabled, session.characterId);
      return apiResponse(setCorpDataSharingEndpoint, 200, { corporationId, enabled });
    },
  });
}

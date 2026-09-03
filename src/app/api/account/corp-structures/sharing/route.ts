import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  setCorpStructureSharingEndpoint,
  setCorpStructureSharingRequestSchema,
} from '@/features/owned-structures/api-contract';
import { setCorpStructureSharing } from '@/features/owned-structures/queries';
import { getSessionCharacterId } from '@/platform/auth/session';
import { checkUserId } from '@/platform/auth/route-guards';
import { stationManagerGate } from '@/composition/sync/corp-structures-sync';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.set-corp-structure-sharing',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, setCorpStructureSharingRequestSchema),
    handle: async ({ userId }, { corporationId, enabled }) => {

      const stationManager = await stationManagerGate(userId, corporationId);
      if (!stationManager.ok) {
        return apiResponse(setCorpStructureSharingEndpoint, 403, stationManager.failure);
      }

      await setCorpStructureSharing(corporationId, enabled, await getSessionCharacterId());
      return apiResponse(setCorpStructureSharingEndpoint, 200, { corporationId, enabled });
    },
  });
}

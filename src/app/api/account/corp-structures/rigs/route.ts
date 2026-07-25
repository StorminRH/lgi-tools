import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import {
  setCorpStructureRigsEndpoint,
  setCorpStructureRigsRequestSchema,
} from '@/features/owned-structures/api-contract';
import {
  getCorpStructureRigs,
  getCorpStructures,
  upsertCorpStructureRigs,
} from '@/features/owned-structures/queries';
import { validateCorpStructureRigs } from '@/features/owned-structures/rig-validation';
import { checkUserId } from '@/platform/auth/route-guards';
import { stationManagerGate } from '@/composition/sync/corp-structures-sync';
import { validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * Gated further by corp membership + the in-game Station_Manager role (below).
 * POST /api/account/corp-structures/rigs — record a corp structure's fitted rigs (ESI
 * doesn't expose them), so the planner bonus is exact. Same two-step gate as the
 * sharing toggle: the caller must be a member of the corp AND hold the Station_Manager
 * role. The user id comes from the session, never the body.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.set-corp-structure-rigs',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, setCorpStructureRigsRequestSchema),
    handle: async ({ userId }, body) => {
      const { corporationId, structureId, rigTypeIds, taxPct } = body;

      const stationManager = await stationManagerGate(userId, corporationId);
      if (!stationManager.ok) {
        return apiResponse(setCorpStructureRigsEndpoint, 403, stationManager.failure);
      }

      const [corpStructures, types, rigs] = await Promise.all([
        getCorpStructures([corporationId]),
        getStructureTypes(),
        getStructureRigs(),
      ]);
      const check = validateCorpStructureRigs(
        corpStructures.get(corporationId),
        structureId,
        rigTypeIds,
        types,
        rigs,
      );
      if (!check.ok) {
        return apiResponse(
          setCorpStructureRigsEndpoint,
          400,
          validationFailure('invalid_structure', check.reason),
        );
      }

      await upsertCorpStructureRigs(corporationId, structureId, rigTypeIds, taxPct);
      const saved = (await getCorpStructureRigs([corporationId])).get(structureId);
      return apiResponse(setCorpStructureRigsEndpoint, 200, {
        structureId,
        rigTypeIds,
        taxPct: saved?.taxPct ?? null,
      });
    },
  });
}

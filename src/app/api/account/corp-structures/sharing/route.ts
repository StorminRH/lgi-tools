import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  type CorpStructureSharingResponse,
  setCorpStructureSharingRequestSchema,
} from '@/features/owned-structures/api-contract';
import { setCorpStructureSharing } from '@/features/owned-structures/queries';
import { getSessionCharacterId } from '@/platform/auth/session';
import { requireUserId } from '@/platform/auth/route-guards';
import { stationManagerGate } from '@/db/corp-structures-sync';
import { parseJsonBody } from '@/lib/route-body';

/**
 * Gated further by corp membership + the in-game Station_Manager role (below).
 * POST /api/account/corp-structures/sharing — flip a corp's structure-sharing consent.
 * The route is the trust boundary, gated in two steps: the caller must be a CURRENT
 * member of the corp (decideCorpAccess — fail-closed + audited), and one of their
 * linked pilots in it must hold the Station_Manager role (userHoldsCorpRole). ENABLE
 * opts the corp in; DISABLE wipes its stored structures, sync state, and authored
 * rigs. The user id comes from the session, never the body.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireUserId,
    parse: (incoming) => parseJsonBody(incoming, setCorpStructureSharingRequestSchema),
    handle: async ({ userId }, { corporationId, enabled }) => {
      // Membership first (fail-closed + audited; also refreshes affiliations), then the
      // Station_Manager role on the freshly-refreshed set — the shared two-step gate.
      const denied = await stationManagerGate(userId, corporationId);
      if (denied) return denied;

      await setCorpStructureSharing(corporationId, enabled, await getSessionCharacterId());
      return Response.json({ corporationId, enabled } satisfies CorpStructureSharingResponse);
    },
  });
}

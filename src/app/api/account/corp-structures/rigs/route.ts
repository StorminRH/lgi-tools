import type { NextRequest } from 'next/server';
import {
  type CorpStructureRigsResponse,
  setCorpStructureRigsRequestSchema,
} from '@/features/owned-structures/api-contract';
import { CORP_STRUCTURES_REQUIRED_ROLES } from '@/features/owned-structures/corp-sync-eligibility';
import { upsertCorpStructureRigs } from '@/features/owned-structures/queries';
import { decideCorpAccess } from '@/features/auth/corp-access';
import { getCurrentUserId } from '@/features/auth/session';
import { userHoldsCorpRole } from '@/db/corp-structures-sync';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// Gated further by corp membership + the in-game Station_Manager role (below).
// POST /api/account/corp-structures/rigs — record a corp structure's fitted rigs (ESI
// doesn't expose them), so the planner bonus is exact. Same two-step gate as the
// sharing toggle: the caller must be a member of the corp AND hold the Station_Manager
// role. The user id comes from the session, never the body.
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, setCorpStructureRigsRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { corporationId, structureId, rigTypeIds } = parsed.data;

  const access = await decideCorpAccess({ userId, corporationId });
  if (!access.allowed) return new Response('Not a member of this corporation', { status: 403 });
  if (!(await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
    return new Response('Requires the Station Manager role', { status: 403 });
  }

  await upsertCorpStructureRigs(corporationId, structureId, rigTypeIds);
  return Response.json({ structureId, rigTypeIds } satisfies CorpStructureRigsResponse);
}

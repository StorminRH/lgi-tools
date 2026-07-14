import type { NextRequest } from 'next/server';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import {
  type CorpStructureRigsResponse,
  setCorpStructureRigsRequestSchema,
} from '@/features/owned-structures/api-contract';
import {
  getCorpStructureRigs,
  getCorpStructures,
  upsertCorpStructureRigs,
} from '@/features/owned-structures/queries';
import { validateCorpStructureRigs } from '@/features/owned-structures/rig-validation';
import { requireUserId } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import { stationManagerGate } from '@/db/corp-structures-sync';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// Gated further by corp membership + the in-game Station_Manager role (below).
// POST /api/account/corp-structures/rigs — record a corp structure's fitted rigs (ESI
// doesn't expose them), so the planner bonus is exact. Same two-step gate as the
// sharing toggle: the caller must be a member of the corp AND hold the Station_Manager
// role. The user id comes from the session, never the body.
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireUserId();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);
  const userId = gate.userId;

  const parsed = await parseJsonBody(request, setCorpStructureRigsRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { corporationId, structureId, rigTypeIds, taxPct } = parsed.data;

  const denied = await stationManagerGate(userId, corporationId);
  if (denied) return denied;

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
  if (!check.ok) return new Response(check.reason, { status: 400 });

  await upsertCorpStructureRigs(corporationId, structureId, rigTypeIds, taxPct);
  const saved = (await getCorpStructureRigs([corporationId])).get(structureId);
  return Response.json({
    structureId,
    rigTypeIds,
    taxPct: saved?.taxPct ?? null,
  } satisfies CorpStructureRigsResponse);
}

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getStructureRigs, getStructureTypes, solarSystemExists } from '@/data/eve-data/queries';
import {
  createCustomStructureRequestSchema,
  MAX_CUSTOM_STRUCTURES_PER_USER,
  type CustomStructuresResponse,
} from '@/features/custom-structures/api-contract';
import {
  countCustomStructures,
  createCustomStructure,
  listCustomStructures,
} from '@/features/custom-structures/queries';
import { validateCustomStructureSelection } from '@/features/custom-structures/validation';
import { getCurrentUserId } from '@/features/auth/session';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// POST /api/account/custom-structures — save one custom structure for the signed-in
// caller. The route is the trust boundary: it confirms the type is a real industry
// structure and every rig fits it, and enforces the per-user cap. The user id comes
// from the session, never the body; anonymous callers are rejected. Returns the
// full updated list (the page reads the initial list server-side, so there is no GET).
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, createCustomStructureRequestSchema);
  if (!parsed.ok) return parsed.response;

  const [types, rigs] = await Promise.all([getStructureTypes(), getStructureRigs()]);
  const check = validateCustomStructureSelection(parsed.data, types, rigs);
  if (!check.ok) return new Response(check.reason, { status: 400 });

  // The optional pin must reference a real solar system (the column is
  // FK-less on purpose — the SDE tables are truncate-rebuilt on re-ingest).
  if (parsed.data.systemId !== null && !(await solarSystemExists(parsed.data.systemId))) {
    return new Response('unknown system', { status: 400 });
  }

  if ((await countCustomStructures(userId)) >= MAX_CUSTOM_STRUCTURES_PER_USER) {
    return new Response('structure limit reached', { status: 409 });
  }

  await createCustomStructure(userId, {
    id: randomUUID(),
    name: parsed.data.name,
    structureTypeId: parsed.data.structureTypeId,
    rigTypeIds: parsed.data.rigTypeIds,
    systemId: parsed.data.systemId,
  });
  const structures = await listCustomStructures(userId);
  return Response.json({ structures } satisfies CustomStructuresResponse, { status: 201 });
}

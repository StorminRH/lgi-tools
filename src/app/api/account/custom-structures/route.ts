import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
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
import { rejectUnknownSystemPin } from '@/features/custom-structures/system-pin';
import { validateCustomStructureSelection } from '@/features/custom-structures/validation';
import { requireUserId } from '@/platform/auth/route-guards';
import { parseJsonBody } from '@/transport/route-body';

/**
 * POST /api/account/custom-structures — save one custom structure for the signed-in
 * caller. The route is the trust boundary: it confirms the type is a real industry
 * structure and every rig fits it, and enforces the per-user cap. The user id comes
 * from the session, never the body; anonymous callers are rejected. Returns the
 * full updated list (the page reads the initial list server-side, so there is no GET).
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireUserId,
    parse: (incoming) => parseJsonBody(incoming, createCustomStructureRequestSchema),
    handle: async ({ userId }, body) => {
      const [types, rigs] = await Promise.all([getStructureTypes(), getStructureRigs()]);
      const check = validateCustomStructureSelection(body, types, rigs);
      if (!check.ok) return new Response(check.reason, { status: 400 });

      const badPin = await rejectUnknownSystemPin(body.systemId);
      if (badPin) return badPin;

      if ((await countCustomStructures(userId)) >= MAX_CUSTOM_STRUCTURES_PER_USER) {
        return new Response('structure limit reached', { status: 409 });
      }

      await createCustomStructure(userId, {
        id: randomUUID(),
        name: body.name,
        structureTypeId: body.structureTypeId,
        rigTypeIds: body.rigTypeIds,
        systemId: body.systemId,
        taxPct: body.taxPct,
      });
      const structures = await listCustomStructures(userId);
      return Response.json({ structures } satisfies CustomStructuresResponse, { status: 201 });
    },
  });
}

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import {
  createCustomStructureEndpoint,
  createCustomStructureRequestSchema,
  MAX_CUSTOM_STRUCTURES_PER_USER,
} from '@/features/custom-structures/api-contract';
import {
  countCustomStructures,
  createCustomStructure,
  listCustomStructures,
} from '@/features/custom-structures/queries';
import { rejectUnknownSystemPin } from '@/features/custom-structures/system-pin';
import { validateCustomStructureSelection } from '@/features/custom-structures/validation';
import { conflictFailure, validationFailure } from '@/lib/failure';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

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
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, createCustomStructureRequestSchema),
    handle: async ({ userId }, body) => {
      const [types, rigs] = await Promise.all([getStructureTypes(), getStructureRigs()]);
      const check = validateCustomStructureSelection(body, types, rigs);
      if (!check.ok) {
        return apiResponse(
          createCustomStructureEndpoint,
          400,
          validationFailure('invalid_structure', check.reason),
        );
      }

      const pin = await rejectUnknownSystemPin(body.systemId);
      if (!pin.ok) return apiResponse(createCustomStructureEndpoint, 400, pin.failure);

      if ((await countCustomStructures(userId)) >= MAX_CUSTOM_STRUCTURES_PER_USER) {
        return apiResponse(
          createCustomStructureEndpoint,
          409,
          conflictFailure('structure_limit', 'structure limit reached'),
        );
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
      return apiResponse(createCustomStructureEndpoint, 201, { structures });
    },
  });
}

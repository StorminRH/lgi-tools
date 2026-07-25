import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  setCustomStructureTaxEndpoint,
  setCustomStructureTaxRequestSchema,
} from '@/features/custom-structures/api-contract';
import { listCustomStructures, setCustomStructureTax } from '@/features/custom-structures/queries';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * POST /api/account/custom-structures/set-tax — set or clear (taxPct: null) the
 * facility tax on one of the caller's own structures. The schema bounds the
 * entry to the in-game 0–10% cap; an entered 0 is a real 0% rate, distinct from
 * null/never-entered (which the fee path treats as the 0.25% NPC baseline).
 * Ownership-scoped in the query like set-pin (a foreign id is a no-op). Echoes
 * back the full updated list.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.set-custom-structure-tax',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, setCustomStructureTaxRequestSchema),
    handle: async ({ userId }, { id, taxPct }) => {
      await setCustomStructureTax(userId, id, taxPct);
      const structures = await listCustomStructures(userId);
      return apiResponse(setCustomStructureTaxEndpoint, 200, { structures });
    },
  });
}

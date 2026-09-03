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

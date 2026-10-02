import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  updateCustomStructureEndpoint,
  updateCustomStructureRequestSchema,
} from '@/features/custom-structures/api-contract';
import { listCustomStructures, updateCustomStructure } from '@/features/custom-structures/queries';
import { rejectInvalidCustomStructure } from '@/features/custom-structures/system-pin';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.update-custom-structure',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, updateCustomStructureRequestSchema),
    handle: async ({ userId }, { id, ...input }) => {
      const check = await rejectInvalidCustomStructure(input);
      if (!check.ok) return apiResponse(updateCustomStructureEndpoint, 400, check.failure);

      await updateCustomStructure(userId, id, input);
      const structures = await listCustomStructures(userId);
      return apiResponse(updateCustomStructureEndpoint, 200, { structures });
    },
  });
}

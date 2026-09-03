import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  deleteCustomStructureEndpoint,
  deleteCustomStructureRequestSchema,
} from '@/features/custom-structures/api-contract';
import {
  deleteCustomStructure,
  listCustomStructures,
} from '@/features/custom-structures/queries';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.delete-custom-structure',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, deleteCustomStructureRequestSchema),
    handle: async ({ userId }, { id }) => {
      await deleteCustomStructure(userId, id);
      const structures = await listCustomStructures(userId);
      return apiResponse(deleteCustomStructureEndpoint, 200, { structures });
    },
  });
}

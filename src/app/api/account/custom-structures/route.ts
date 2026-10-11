import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  createCustomStructureEndpoint,
  createCustomStructureRequestSchema,
} from '@/features/custom-structures/api-contract';
import { createCustomStructure, listCustomStructures } from '@/features/custom-structures/queries';
import { rejectInvalidCustomStructure } from '@/features/custom-structures/save-boundary';
import { conflictFailure } from '@/lib/failure';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.create-custom-structure',
    endpoint: createCustomStructureEndpoint,
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, createCustomStructureRequestSchema),
    handle: async ({ userId }, body) => {
      const check = await rejectInvalidCustomStructure(body);
      if (!check.ok) return apiResponse(createCustomStructureEndpoint, 400, check.failure);

      const createdId = randomUUID();
      const created = await createCustomStructure(userId, { id: createdId, ...body });
      if (!created) {
        return apiResponse(
          createCustomStructureEndpoint,
          409,
          conflictFailure('structure_limit', 'structure limit reached'),
        );
      }
      const structures = await listCustomStructures(userId);
      return apiResponse(createCustomStructureEndpoint, 201, { structures, createdId });
    },
  });
}

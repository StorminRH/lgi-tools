import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
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
import { rejectInvalidCustomStructure } from '@/features/custom-structures/system-pin';
import { conflictFailure } from '@/lib/failure';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.create-custom-structure',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, createCustomStructureRequestSchema),
    handle: async ({ userId }, body) => {
      const check = await rejectInvalidCustomStructure(body);
      if (!check.ok) return apiResponse(createCustomStructureEndpoint, 400, check.failure);

      if ((await countCustomStructures(userId)) >= MAX_CUSTOM_STRUCTURES_PER_USER) {
        return apiResponse(
          createCustomStructureEndpoint,
          409,
          conflictFailure('structure_limit', 'structure limit reached'),
        );
      }

      await createCustomStructure(userId, { id: randomUUID(), ...body });
      const structures = await listCustomStructures(userId);
      return apiResponse(createCustomStructureEndpoint, 201, { structures });
    },
  });
}

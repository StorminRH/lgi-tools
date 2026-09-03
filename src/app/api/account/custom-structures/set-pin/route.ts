import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  setCustomStructurePinEndpoint,
  setCustomStructurePinRequestSchema,
} from '@/features/custom-structures/api-contract';
import { listCustomStructures, setCustomStructurePin } from '@/features/custom-structures/queries';
import { rejectUnknownSystemPin } from '@/features/custom-structures/system-pin';
import { checkUserId } from '@/platform/auth/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'structures.set-custom-structure-pin',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, setCustomStructurePinRequestSchema),
    handle: async ({ userId }, { id, systemId }) => {
      const pin = await rejectUnknownSystemPin(systemId);
      if (!pin.ok) return apiResponse(setCustomStructurePinEndpoint, 400, pin.failure);

      await setCustomStructurePin(userId, id, systemId);
      const structures = await listCustomStructures(userId);
      return apiResponse(setCustomStructurePinEndpoint, 200, { structures });
    },
  });
}

import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  setCustomStructurePinRequestSchema,
  type CustomStructuresResponse,
} from '@/features/custom-structures/api-contract';
import { listCustomStructures, setCustomStructurePin } from '@/features/custom-structures/queries';
import { rejectUnknownSystemPin } from '@/features/custom-structures/system-pin';
import { requireUserId } from '@/features/auth/route-guards';
import { parseJsonBody } from '@/lib/route-body';

/**
 * POST /api/account/custom-structures/set-pin — pin one of the caller's own
 * structures to a system, or unpin it (systemId: null). A non-null pin must
 * reference a real solar system (the column is FK-less on purpose — the SDE
 * tables are truncate-rebuilt on re-ingest). Ownership-scoped in the query
 * like delete (a foreign id is a no-op). Echoes back the full updated list.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireUserId,
    parse: (incoming) => parseJsonBody(incoming, setCustomStructurePinRequestSchema),
    handle: async ({ userId }, { id, systemId }) => {
      const badPin = await rejectUnknownSystemPin(systemId);
      if (badPin) return badPin;

      await setCustomStructurePin(userId, id, systemId);
      const structures = await listCustomStructures(userId);
      return Response.json({ structures } satisfies CustomStructuresResponse);
    },
  });
}

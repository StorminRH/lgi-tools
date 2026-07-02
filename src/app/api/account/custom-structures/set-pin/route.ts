import type { NextRequest } from 'next/server';
import { solarSystemExists } from '@/data/eve-data/queries';
import {
  setCustomStructurePinRequestSchema,
  type CustomStructuresResponse,
} from '@/features/custom-structures/api-contract';
import { listCustomStructures, setCustomStructurePin } from '@/features/custom-structures/queries';
import { getCurrentUserId } from '@/features/auth/session';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// POST /api/account/custom-structures/set-pin — pin one of the caller's own
// structures to a system, or unpin it (systemId: null). A non-null pin must
// reference a real solar system (the column is FK-less on purpose — the SDE
// tables are truncate-rebuilt on re-ingest). Ownership-scoped in the query
// like delete (a foreign id is a no-op). Echoes back the full updated list.
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, setCustomStructurePinRequestSchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.systemId !== null && !(await solarSystemExists(parsed.data.systemId))) {
    return new Response('unknown system', { status: 400 });
  }

  await setCustomStructurePin(userId, parsed.data.id, parsed.data.systemId);
  const structures = await listCustomStructures(userId);
  return Response.json({ structures } satisfies CustomStructuresResponse);
}

import type { NextRequest } from 'next/server';
import {
  setCustomStructureTaxRequestSchema,
  type CustomStructuresResponse,
} from '@/features/custom-structures/api-contract';
import { listCustomStructures, setCustomStructureTax } from '@/features/custom-structures/queries';
import { requireUserId } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// POST /api/account/custom-structures/set-tax — set or clear (taxPct: null) the
// facility tax on one of the caller's own structures. The schema bounds the
// entry to the in-game 0–10% cap; an entered 0 is a real 0% rate, distinct from
// null/never-entered (which the fee path treats as the 0.25% NPC baseline).
// Ownership-scoped in the query like set-pin (a foreign id is a no-op). Echoes
// back the full updated list.
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireUserId();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);
  const userId = gate.userId;

  const parsed = await parseJsonBody(request, setCustomStructureTaxRequestSchema);
  if (!parsed.ok) return parsed.response;

  await setCustomStructureTax(userId, parsed.data.id, parsed.data.taxPct);
  const structures = await listCustomStructures(userId);
  return Response.json({ structures } satisfies CustomStructuresResponse);
}

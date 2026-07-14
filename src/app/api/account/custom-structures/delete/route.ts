import type { NextRequest } from 'next/server';
import {
  deleteCustomStructureRequestSchema,
  type CustomStructuresResponse,
} from '@/features/custom-structures/api-contract';
import {
  deleteCustomStructure,
  listCustomStructures,
} from '@/features/custom-structures/queries';
import { requireUserId } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// POST /api/account/custom-structures/delete. Deletes one of the caller's OWN
// structures (the query's (userId, id) predicate makes it a no-op for a row the
// caller doesn't own). Returns the updated list. apiFetch only speaks GET/POST,
// so this is a POST sub-route rather than an HTTP DELETE.
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireUserId();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);
  const userId = gate.userId;

  const parsed = await parseJsonBody(request, deleteCustomStructureRequestSchema);
  if (!parsed.ok) return parsed.response;

  await deleteCustomStructure(userId, parsed.data.id);
  const structures = await listCustomStructures(userId);
  return Response.json({ structures } satisfies CustomStructuresResponse);
}

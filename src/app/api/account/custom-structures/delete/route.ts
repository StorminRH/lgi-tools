import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import {
  deleteCustomStructureRequestSchema,
  type CustomStructuresResponse,
} from '@/features/custom-structures/api-contract';
import {
  deleteCustomStructure,
  listCustomStructures,
} from '@/features/custom-structures/queries';
import { requireUserId } from '@/platform/auth/route-guards';
import { parseJsonBody } from '@/lib/route-body';

/**
 * POST /api/account/custom-structures/delete. Deletes one of the caller's OWN
 * structures (the query's (userId, id) predicate makes it a no-op for a row the
 * caller doesn't own). Returns the updated list. apiFetch only speaks GET/POST,
 * so this is a POST sub-route rather than an HTTP DELETE.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireUserId,
    parse: (incoming) => parseJsonBody(incoming, deleteCustomStructureRequestSchema),
    handle: async ({ userId }, { id }) => {
      await deleteCustomStructure(userId, id);
      const structures = await listCustomStructures(userId);
      return Response.json({ structures } satisfies CustomStructuresResponse);
    },
  });
}

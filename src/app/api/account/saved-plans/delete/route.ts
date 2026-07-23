import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { requireUserId } from '@/platform/auth/route-guards';
import {
  deleteSavedPlanRequestSchema,
  type SavedPlansResponse,
} from '@/features/industry-planner/api-contract';
import { deleteSavedPlan, listSavedPlans } from '@/features/industry-planner/saved-plans-queries';
import { parseJsonBody } from '@/transport/route-body';

/**
 * POST /api/account/saved-plans/delete — delete one of the caller's OWN
 * templates (the query's (userId, id) predicate makes a foreign id a no-op).
 * Echoes the updated list. apiFetch only speaks GET/POST, so this is a POST
 * sub-route rather than an HTTP DELETE.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireUserId,
    parse: (incoming) => parseJsonBody(incoming, deleteSavedPlanRequestSchema),
    handle: async ({ userId }, { id }) => {
      await deleteSavedPlan(userId, id);
      const plans = await listSavedPlans(userId);
      return Response.json({ plans } satisfies SavedPlansResponse);
    },
  });
}

import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkUserId } from '@/platform/auth/route-guards';
import {
  renameSavedPlanEndpoint,
  renameSavedPlanRequestSchema,
} from '@/features/industry-planner/api-contract';
import { listSavedPlans, renameSavedPlan } from '@/features/industry-planner/saved-plans-queries';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * POST /api/account/saved-plans/rename — rename one of the caller's OWN
 * templates (the query's (userId, id) predicate makes a foreign id a no-op).
 * Echoes the full updated list.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, renameSavedPlanRequestSchema),
    handle: async ({ userId }, { id, name }) => {
      await renameSavedPlan(userId, id, name);
      const plans = await listSavedPlans(userId);
      return apiResponse(renameSavedPlanEndpoint, 200, { plans });
    },
  });
}

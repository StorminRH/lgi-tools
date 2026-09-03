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

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'planner.rename-saved-plan',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, renameSavedPlanRequestSchema),
    handle: async ({ userId }, { id, name }) => {
      await renameSavedPlan(userId, id, name);
      const plans = await listSavedPlans(userId);
      return apiResponse(renameSavedPlanEndpoint, 200, { plans });
    },
  });
}

import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkUserId } from '@/composition/route-guards';
import {
  deleteSavedPlanEndpoint,
  deleteSavedPlanRequestSchema,
} from '@/features/industry-planner/api-contract';
import { deleteSavedPlan, listSavedPlans } from '@/features/industry-planner/saved-plans-queries';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'planner.delete-saved-plan',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, deleteSavedPlanRequestSchema),
    handle: async ({ userId }, { id }) => {
      await deleteSavedPlan(userId, id);
      const plans = await listSavedPlans(userId);
      return apiResponse(deleteSavedPlanEndpoint, 200, { plans });
    },
  });
}

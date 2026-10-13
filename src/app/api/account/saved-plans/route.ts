import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { getCurrentUserId } from '@/composition/session';
import { checkUserId } from '@/composition/route-guards';
import {
  createSavedPlanEndpoint,
  createSavedPlanRequestSchema,
  savedPlansEndpoint,
} from '@/features/industry-planner/api-contract';
import { getBlueprintStructure } from '@/features/industry-planner/queries';
import { createSavedPlan, listSavedPlans } from '@/features/industry-planner/saved-plans-queries';
import { conflictFailure, validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return apiResponse(savedPlansEndpoint, 200, { plans: [] });
  const plans = await listSavedPlans(userId);
  return apiResponse(savedPlansEndpoint, 200, { plans });
}

export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'planner.create-saved-plan',
    endpoint: createSavedPlanEndpoint,
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, createSavedPlanRequestSchema),
    handle: async ({ userId }, body) => {
      const structure = await getBlueprintStructure(body.snapshot.blueprintTypeId);
      if (!structure) {
        return apiResponse(
          createSavedPlanEndpoint,
          400,
          validationFailure('unknown_blueprint', 'unknown blueprint'),
        );
      }

      const created = await createSavedPlan(userId, {
        id: randomUUID(),
        name: body.name,
        blueprintTypeId: body.snapshot.blueprintTypeId,
        productTypeId: structure.product.typeId,
        productName: structure.product.name,
        snapshot: body.snapshot,
      });
      if (!created) {
        return apiResponse(
          createSavedPlanEndpoint,
          409,
          conflictFailure('template_limit', 'template limit reached'),
        );
      }
      const plans = await listSavedPlans(userId);
      return apiResponse(createSavedPlanEndpoint, 201, { plans });
    },
  });
}

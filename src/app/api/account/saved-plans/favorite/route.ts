import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { checkUserId } from '@/platform/auth/route-guards';
import {
  favoriteSavedPlanEndpoint,
  favoriteSavedPlanRequestSchema,
} from '@/features/industry-planner/api-contract';
import {
  listSavedPlans,
  setSavedPlanFavorite,
} from '@/features/industry-planner/saved-plans-queries';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * POST /api/account/saved-plans/favorite — star/unstar one of the caller's OWN
 * templates (ownership-scoped like delete; a foreign id is a no-op). Echoes
 * the full updated list.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, favoriteSavedPlanRequestSchema),
    handle: async ({ userId }, { id, favorite }) => {
      await setSavedPlanFavorite(userId, id, favorite);
      const plans = await listSavedPlans(userId);
      return apiResponse(favoriteSavedPlanEndpoint, 200, { plans });
    },
  });
}

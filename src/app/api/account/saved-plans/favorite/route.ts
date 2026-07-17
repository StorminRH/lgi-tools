import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { requireUserId } from '@/features/auth/route-guards';
import {
  favoriteSavedPlanRequestSchema,
  type SavedPlansResponse,
} from '@/features/industry-planner/api-contract';
import {
  listSavedPlans,
  setSavedPlanFavorite,
} from '@/features/industry-planner/saved-plans-queries';
import { parseJsonBody } from '@/lib/route-body';

/**
 * POST /api/account/saved-plans/favorite — star/unstar one of the caller's OWN
 * templates (ownership-scoped like delete; a foreign id is a no-op). Echoes
 * the full updated list.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireUserId,
    parse: (incoming) => parseJsonBody(incoming, favoriteSavedPlanRequestSchema),
    handle: async ({ userId }, { id, favorite }) => {
      await setSavedPlanFavorite(userId, id, favorite);
      const plans = await listSavedPlans(userId);
      return Response.json({ plans } satisfies SavedPlansResponse);
    },
  });
}

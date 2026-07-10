import type { NextRequest } from 'next/server';
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

// authz: auth
// POST /api/account/saved-plans/favorite — star/unstar one of the caller's OWN
// templates (ownership-scoped like delete; a foreign id is a no-op). Echoes
// the full updated list.
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireUserId();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const parsed = await parseJsonBody(request, favoriteSavedPlanRequestSchema);
  if (!parsed.ok) return parsed.response;

  await setSavedPlanFavorite(userId, parsed.data.id, parsed.data.favorite);
  const plans = await listSavedPlans(userId);
  return Response.json({ plans } satisfies SavedPlansResponse);
}

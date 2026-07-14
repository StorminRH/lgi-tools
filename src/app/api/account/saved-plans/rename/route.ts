import type { NextRequest } from 'next/server';
import { requireUserId } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import {
  renameSavedPlanRequestSchema,
  type SavedPlansResponse,
} from '@/features/industry-planner/api-contract';
import { listSavedPlans, renameSavedPlan } from '@/features/industry-planner/saved-plans-queries';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// POST /api/account/saved-plans/rename — rename one of the caller's OWN
// templates (the query's (userId, id) predicate makes a foreign id a no-op).
// Echoes the full updated list.
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireUserId();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);
  const userId = gate.userId;

  const parsed = await parseJsonBody(request, renameSavedPlanRequestSchema);
  if (!parsed.ok) return parsed.response;

  await renameSavedPlan(userId, parsed.data.id, parsed.data.name);
  const plans = await listSavedPlans(userId);
  return Response.json({ plans } satisfies SavedPlansResponse);
}

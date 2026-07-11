import type { NextRequest } from 'next/server';
import { requireUserId } from '@/features/auth/route-guards';
import {
  deleteSavedPlanRequestSchema,
  type SavedPlansResponse,
} from '@/features/industry-planner/api-contract';
import { deleteSavedPlan, listSavedPlans } from '@/features/industry-planner/saved-plans-queries';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// POST /api/account/saved-plans/delete — delete one of the caller's OWN
// templates (the query's (userId, id) predicate makes a foreign id a no-op).
// Echoes the updated list. apiFetch only speaks GET/POST, so this is a POST
// sub-route rather than an HTTP DELETE.
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireUserId();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const parsed = await parseJsonBody(request, deleteSavedPlanRequestSchema);
  if (!parsed.ok) return parsed.response;

  await deleteSavedPlan(userId, parsed.data.id);
  const plans = await listSavedPlans(userId);
  return Response.json({ plans } satisfies SavedPlansResponse);
}

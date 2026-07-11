import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/features/auth/session';
import { requireUserId } from '@/features/auth/route-guards';
import {
  createSavedPlanRequestSchema,
  MAX_SAVED_PLANS_PER_USER,
  type SavedPlansResponse,
} from '@/features/industry-planner/api-contract';
import { getBlueprintStructure } from '@/features/industry-planner/queries';
import {
  countSavedPlans,
  createSavedPlan,
  deleteSavedPlan,
  listSavedPlans,
} from '@/features/industry-planner/saved-plans-queries';
import { parseJsonBody } from '@/lib/route-body';

// authz: auth
// GET /api/account/saved-plans — the caller's saved build templates. The
// fail-open read posture (#197): an anonymous caller gets a typed empty list,
// never an error, so the planner's template surface degrades instead of
// breaking.
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ plans: [] } satisfies SavedPlansResponse);
  const plans = await listSavedPlans(userId);
  return Response.json({ plans } satisfies SavedPlansResponse);
}

// POST /api/account/saved-plans — save the planner's current configuration as
// a named template. The user id comes from the session, never the body. The
// snapshot is validated shallowly (version + blueprint anchor + byte cap — the
// contract explains why deep validation waits until load); the blueprint must
// resolve (it supplies the denormalized product columns the list renders), and
// the per-user cap holds. Echoes the full updated list.
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireUserId();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const parsed = await parseJsonBody(request, createSavedPlanRequestSchema);
  if (!parsed.ok) return parsed.response;

  const structure = await getBlueprintStructure(parsed.data.snapshot.blueprintTypeId);
  if (!structure) return new Response('unknown blueprint', { status: 400 });

  if ((await countSavedPlans(userId)) >= MAX_SAVED_PLANS_PER_USER) {
    return new Response('template limit reached', { status: 409 });
  }

  const id = randomUUID();
  await createSavedPlan(userId, {
    id,
    name: parsed.data.name,
    blueprintTypeId: parsed.data.snapshot.blueprintTypeId,
    productTypeId: structure.product.typeId,
    productName: structure.product.name,
    snapshot: parsed.data.snapshot,
  });
  // The pre-check races concurrent saves (count-then-insert; the neon-http
  // request path has no transaction to serialize it), so recount after the
  // insert and roll this row back if the cap was breached — simultaneous
  // saves converge at or under the cap instead of past it.
  if ((await countSavedPlans(userId)) > MAX_SAVED_PLANS_PER_USER) {
    await deleteSavedPlan(userId, id);
    return new Response('template limit reached', { status: 409 });
  }
  const plans = await listSavedPlans(userId);
  return Response.json({ plans } satisfies SavedPlansResponse, { status: 201 });
}

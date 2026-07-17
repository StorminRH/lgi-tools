import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { SavedPlanRow } from './api-contract';
import { savedPlans } from './schema';
import type { PlanSnapshotWire } from './template-snapshot';

// Saved-plan queries (3.7.23.1). Every read/write is user-scoped: the user id
// comes from the session (never the body), and the mutations' (userId, id)
// predicate makes an operation on another user's row a silent no-op — never a
// leak, never a 403 that reveals existence (the custom-structures posture).
// Kept apart from queries.ts, whose blueprint reads are 'use cache' cached —
// per-user rows must never sit behind those directives.

/** Favorite-first, then most recently updated — the list's display order. */
export async function listSavedPlans(userId: string): Promise<SavedPlanRow[]> {
  const rows = await db
    .select({
      id: savedPlans.id,
      name: savedPlans.name,
      favorite: savedPlans.favorite,
      blueprintTypeId: savedPlans.blueprintTypeId,
      productTypeId: savedPlans.productTypeId,
      productName: savedPlans.productName,
      snapshot: savedPlans.snapshot,
      updatedAt: savedPlans.updatedAt,
    })
    .from(savedPlans)
    .where(eq(savedPlans.userId, userId))
    .orderBy(desc(savedPlans.favorite), desc(savedPlans.updatedAt));
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function countSavedPlans(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(savedPlans)
    .where(eq(savedPlans.userId, userId));
  return row?.n ?? 0;
}

export async function createSavedPlan(
  userId: string,
  input: {
    id: string;
    name: string;
    blueprintTypeId: number;
    productTypeId: number;
    productName: string;
    snapshot: PlanSnapshotWire;
  },
): Promise<void> {
  await db.insert(savedPlans).values({ userId, ...input });
}

/**
 * Rename refreshes updatedAt (a content change reorders the list); the
 * favorite toggle deliberately does not — starring must not shuffle rows.
 */
export async function renameSavedPlan(userId: string, id: string, name: string): Promise<void> {
  await db
    .update(savedPlans)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(savedPlans.userId, userId), eq(savedPlans.id, id)));
}

export async function setSavedPlanFavorite(
  userId: string,
  id: string,
  favorite: boolean,
): Promise<void> {
  await db
    .update(savedPlans)
    .set({ favorite })
    .where(and(eq(savedPlans.userId, userId), eq(savedPlans.id, id)));
}

export async function deleteSavedPlan(userId: string, id: string): Promise<void> {
  await db
    .delete(savedPlans)
    .where(and(eq(savedPlans.userId, userId), eq(savedPlans.id, id)));
}

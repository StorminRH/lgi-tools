import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { SavedPlanRow } from './api-contract';
import { savedPlans } from './schema';
import type { PlanSnapshotWire } from './template-snapshot';

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

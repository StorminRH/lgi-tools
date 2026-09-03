import { ACTIVITY_NAME_TO_ID, INDUSTRY_ACTIVITY_NAMES } from './constants';
import { activitiesToRows, type BlueprintActivities } from './tree-resolver';

export type BlueprintOutput = {
  productTypeId: number;
  quantity: number;
  activityId: number;
};

export type BlueprintSearchRow = {
  blueprintTypeId: number;
  activityId: number;
  productTypeId: number;
  name: string;
};

export type PendingSearchRow = {
  blueprintTypeId: number;
  activityId: number;
  productTypeId: number;
};

export function pickBlueprintOutput(
  activities: BlueprintActivities,
): BlueprintOutput | null {
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const product = activities[name]?.products?.[0];
    if (product) {
      return {
        productTypeId: product.typeID,
        quantity: product.quantity,
        activityId: ACTIVITY_NAME_TO_ID[name],
      };
    }
  }
  return null;
}

export function pickProducingActivityId(activities: BlueprintActivities): number | null {
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const act = activities[name];
    if (act?.products && act.products.length > 0) {
      return ACTIVITY_NAME_TO_ID[name];
    }
  }
  return null;
}

export function collectSearchPending(
  rows: ReadonlyArray<{ blueprintTypeId: number; activities: unknown }>,
): { pending: PendingSearchRow[]; productIds: Set<number> } {
  const pending: PendingSearchRow[] = [];
  const productIds = new Set<number>();
  for (const r of rows) {
    const activities = (r.activities ?? {}) as BlueprintActivities;
    for (const name of INDUSTRY_ACTIVITY_NAMES) {
      for (const p of activities[name]?.products ?? []) {
        pending.push({
          blueprintTypeId: r.blueprintTypeId,
          activityId: ACTIVITY_NAME_TO_ID[name],
          productTypeId: p.typeID,
        });
        productIds.add(p.typeID);
      }
    }
  }
  return { pending, productIds };
}

export function resolveSearchRows(
  pending: readonly PendingSearchRow[],
  nameRows: ReadonlyArray<{ id: number; name: string }>,
): BlueprintSearchRow[] {
  const nameById = new Map<number, string>();
  for (const r of nameRows) nameById.set(r.id, r.name);
  const out: BlueprintSearchRow[] = [];
  for (const p of pending) {
    const name = nameById.get(p.productTypeId);
    if (name === undefined) continue;
    out.push({
      blueprintTypeId: p.blueprintTypeId,
      activityId: p.activityId,
      productTypeId: p.productTypeId,
      name,
    });
  }
  return out;
}

export function collectTrackedTypeIds(
  rows: ReadonlyArray<{ blueprintTypeId: number; activities: unknown }>,
): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    const { mats, prods } = activitiesToRows(
      r.blueprintTypeId,
      (r.activities ?? {}) as BlueprintActivities,
    );
    for (const m of mats) set.add(m.materialTypeId);
    for (const p of prods) set.add(p.productTypeId);
  }
  return [...set];
}

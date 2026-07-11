// Pure row-shaping for the blueprint queries in `queries.ts`. The DB reads there
// wrap two chores each — a Drizzle select and the flatten/join/pick that turns
// its raw `activities` JSONB rows into the planner's typed shapes. This module
// owns that second chore so the query rims stay thin (select → shape) and the
// branching is unit-testable without a database. No DB / no next/cache import.

import { ACTIVITY_NAME_TO_ID, INDUSTRY_ACTIVITY_NAMES } from './constants';
import { activitiesToRows, type BlueprintActivities } from './tree-resolver';

// The item a blueprint produces and how many per run, for the chosen industry
// activity (manufacturing 1 preferred over reaction 11). See getBlueprintOutput.
export type BlueprintOutput = {
  productTypeId: number;
  quantity: number;
  activityId: number;
};

// One row per (blueprint, manufacturing/reaction product) for the planner's
// blueprint search index. See getBlueprintSearchRows.
export type BlueprintSearchRow = {
  blueprintTypeId: number;
  activityId: number;
  productTypeId: number;
  name: string;
};

// A search row before its product name is joined in — the intermediate the
// two-phase search query carries between its two reads.
export type PendingSearchRow = {
  blueprintTypeId: number;
  activityId: number;
  productTypeId: number;
};

// The blueprint's first product under the preferred industry activity, or null
// when it produces nothing under either (not planner-buildable). Manufacturing
// wins over reaction (a blueprint carries at most one).
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

// The industry activity id (1 = manufacturing, 11 = reaction) that actually
// yields a product, preferring manufacturing (the lower id — INDUSTRY_ACTIVITY_
// NAMES is ordered manufacturing-first). Null when neither yields a product.
export function pickProducingActivityId(activities: BlueprintActivities): number | null {
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const act = activities[name];
    if (act?.products && act.products.length > 0) {
      return ACTIVITY_NAME_TO_ID[name];
    }
  }
  return null;
}

// Phase one of the search query: flatten every manufacturing/reaction product of
// every (already published-filtered) blueprint row into pending rows, collecting
// the product ids whose published names the caller then looks up.
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

// Phase two: join the published product names onto the pending rows, dropping
// any product whose name didn't come back (an unpublished product — the
// degenerate self-recipe junk the search index must not carry).
export function resolveSearchRows(
  pending: readonly PendingSearchRow[],
  nameRows: ReadonlyArray<{ id: number; name: string }>,
): BlueprintSearchRow[] {
  const nameById = new Map<number, string>();
  for (const r of nameRows) nameById.set(r.id, r.name);
  const out: BlueprintSearchRow[] = [];
  for (const p of pending) {
    const name = nameById.get(p.productTypeId);
    if (name === undefined) continue; // unpublished product → drop
    out.push({
      blueprintTypeId: p.blueprintTypeId,
      activityId: p.activityId,
      productTypeId: p.productTypeId,
      name,
    });
  }
  return out;
}

// Union of every type id that appears as a material input OR product output under
// manufacturing/reactions across all blueprint rows — the set upserted into
// `market_prices` after each SDE ingest.
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

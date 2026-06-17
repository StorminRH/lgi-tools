import { and, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '@/db';
import {
  blueprintTrees,
  eveCategories,
  eveGroups,
  eveNpcStations,
  eveSolarSystems,
  eveStationOperations,
  eveTypes,
  industryBlueprints,
  typeDogma,
} from '@/db/schema';
import { ACTIVITY_NAME_TO_ID, INDUSTRY_ACTIVITY_NAMES } from './constants';
import { activitiesToRows, type BlueprintActivities, type TreeNode } from './tree-resolver';
import type { AttrMap, EveType } from './types';

// Same wrinkle as market-prices queries — accept the lazy `@/db` proxy
// or a transactional handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

const TYPE_COLUMNS = {
  id: eveTypes.id,
  groupId: eveTypes.groupId,
  name: eveTypes.name,
  description: eveTypes.description,
  mass: eveTypes.mass,
  volume: eveTypes.volume,
  capacity: eveTypes.capacity,
  portionSize: eveTypes.portionSize,
  raceId: eveTypes.raceId,
  basePrice: eveTypes.basePrice,
  published: eveTypes.published,
  marketGroupId: eveTypes.marketGroupId,
  iconId: eveTypes.iconId,
  soundId: eveTypes.soundId,
  graphicId: eveTypes.graphicId,
} as const;

export async function getTypesByIds(ids: number[]): Promise<EveType[]> {
  if (ids.length === 0) return [];
  return db.select(TYPE_COLUMNS).from(eveTypes).where(inArray(eveTypes.id, ids));
}

// Names only — the bulk type-name resolution behind POST /api/types/names.
// Ids the SDE doesn't know are simply absent from the map.
export async function getTypeNames(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: eveTypes.id, name: eveTypes.name })
    .from(eveTypes)
    .where(inArray(eveTypes.id, ids));
  for (const r of rows) out.set(r.id, r.name);
  return out;
}

export type TypeLabel = { name: string; groupName: string; categoryName: string };

// Name + SDE group/category for a set of types, in one join. The Industry
// Planner uses the group/category to bucket raw materials by source and
// intermediates by construction phase (see the feature's classification).
export async function getTypeLabels(ids: number[]): Promise<Map<number, TypeLabel>> {
  const out = new Map<number, TypeLabel>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: eveTypes.id,
      name: eveTypes.name,
      groupName: eveGroups.name,
      categoryName: eveCategories.name,
    })
    .from(eveTypes)
    .innerJoin(eveGroups, eq(eveGroups.id, eveTypes.groupId))
    .innerJoin(eveCategories, eq(eveCategories.id, eveGroups.categoryId))
    .where(inArray(eveTypes.id, ids));
  for (const r of rows) {
    out.set(r.id, { name: r.name, groupName: r.groupName, categoryName: r.categoryName });
  }
  return out;
}

// One round-trip variant for hot paths like listSiteDetails(). Returns a map
// keyed by typeId; missing typeIds get an empty AttrMap so callers don't have
// to null-check.
export async function getTypeAttributesBatch(
  typeIds: number[],
): Promise<Map<number, AttrMap>> {
  const result = new Map<number, AttrMap>();
  if (typeIds.length === 0) return result;
  for (const id of typeIds) result.set(id, {});
  const rows = await db
    .select({ typeId: typeDogma.typeId, attributes: typeDogma.attributes })
    .from(typeDogma)
    .where(inArray(typeDogma.typeId, typeIds));
  for (const r of rows) {
    // `attributes` is the CCP dogma map { [attributeId]: value }; that IS the
    // AttrMap shape callers expect (object keys are strings at runtime either
    // way), so it replaces the pre-seeded empty map directly.
    result.set(r.typeId, r.attributes as AttrMap);
  }
  return result;
}

// ----- Industry-side helpers ------------------------------------------

// Nested tree-shape JSON for one blueprint, for the Industry Planner
// UI's expandable material breakdown. `null` when the blueprint hasn't
// been resolved yet.
export async function getBlueprintTree(
  blueprintId: number,
): Promise<{ treeJson: TreeNode[]; computedAt: Date } | null> {
  const [row] = await db
    .select({
      treeJson: blueprintTrees.treeJson,
      computedAt: blueprintTrees.computedAt,
    })
    .from(blueprintTrees)
    .where(eq(blueprintTrees.blueprintTypeId, blueprintId))
    .limit(1);
  if (!row) return null;
  return { treeJson: row.treeJson as TreeNode[], computedAt: row.computedAt };
}

// The industry activity (1 = manufacturing, 11 = reaction) that produces each
// of the given blueprints, in one batched query — for labelling tree nodes by
// how they're made without an N+1. A blueprint carries at most one of {1, 11}
// (the resolver collapses the two on that basis); if one somehow carries both,
// we prefer manufacturing (the lower id), matching the structure read.
export async function getActivityByBlueprint(
  blueprintTypeIds: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (blueprintTypeIds.length === 0) return out;
  const rows = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
    })
    .from(industryBlueprints)
    .where(inArray(industryBlueprints.blueprintTypeId, blueprintTypeIds));
  for (const r of rows) {
    const activities = (r.activities ?? {}) as BlueprintActivities;
    // The activity (1 or 11) that actually yields a product; prefer
    // manufacturing (the lower id) — INDUSTRY_ACTIVITY_NAMES is ordered
    // manufacturing-first.
    for (const name of INDUSTRY_ACTIVITY_NAMES) {
      const act = activities[name];
      if (act?.products && act.products.length > 0) {
        out.set(r.blueprintTypeId, ACTIVITY_NAME_TO_ID[name]);
        break;
      }
    }
  }
  return out;
}

// Union of all type IDs that appear as either a material input OR a
// product output under manufacturing/reactions. This is the set we
// upsert into `market_prices` after every SDE ingest; on conflict we
// preserve existing prices, so the existing 54 wormhole-site rows stay
// intact and the ~6,000 new types arrive with NULL prices + epoch
// staleness for the next cron tick to fill.
export async function listTrackedTypeIds(db: AnyPgDb): Promise<number[]> {
  const rows = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
    })
    .from(industryBlueprints);

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

// The item a blueprint produces and how many per run, for the chosen industry
// activity (manufacturing 1 preferred over reaction 11). `null` when the
// blueprint produces nothing under either — i.e. not a planner-buildable. Reads
// the blueprint `activities` JSONB so the Industry Planner never touches the raw
// table directly.
export type BlueprintOutput = {
  productTypeId: number;
  quantity: number;
  activityId: number;
};

export async function getBlueprintOutput(
  blueprintId: number,
): Promise<BlueprintOutput | null> {
  const [row] = await db
    .select({ activities: industryBlueprints.activities })
    .from(industryBlueprints)
    .where(eq(industryBlueprints.blueprintTypeId, blueprintId))
    .limit(1);
  if (!row) return null;
  const activities = (row.activities ?? {}) as BlueprintActivities;
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

// One row per (blueprint, manufacturing/reaction product) whose product is a
// published type, for the Industry Planner's blueprint search index. Filtering to
// published products drops the degenerate self-recipe junk (those produce
// unpublished types), matching the old published inner-join.
export type BlueprintSearchRow = {
  blueprintTypeId: number;
  activityId: number;
  productTypeId: number;
  name: string;
};

export async function getBlueprintSearchRows(): Promise<BlueprintSearchRow[]> {
  const rows = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
    })
    .from(industryBlueprints);

  const pending: Array<{
    blueprintTypeId: number;
    activityId: number;
    productTypeId: number;
  }> = [];
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
  if (productIds.size === 0) return [];

  const nameRows = await db
    .select({ id: eveTypes.id, name: eveTypes.name })
    .from(eveTypes)
    .where(and(inArray(eveTypes.id, [...productIds]), eq(eveTypes.published, true)));
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

// ----- Universe / industry build-location helpers --------------------

// Solar systems that hold at least one industry-capable NPC station — the only
// places an NPC manufacturing job can be installed, so the build-location
// selector only ever suggests these. Distinct systems (a system has many
// stations), with name + security for the picker label. Pochven systems ARE
// included (they carry NPC stations, 3.5.1a); no security/region filter.
export type IndustrySolarSystem = { id: number; name: string; security: number | null };

export async function getIndustrySolarSystems(): Promise<IndustrySolarSystem[]> {
  return db
    .selectDistinct({
      id: eveSolarSystems.id,
      name: eveSolarSystems.name,
      security: eveSolarSystems.securityStatus,
    })
    .from(eveSolarSystems)
    .innerJoin(eveNpcStations, eq(eveNpcStations.solarSystemId, eveSolarSystems.id))
    .where(eq(eveNpcStations.industryCapable, true));
}

// The industry-capable NPC stations in one system — the build-location picker's
// per-system refinement, and the first consumer of the indexed
// (solar_system_id, industry_capable) data model proven in 3.5.1a. NPC stations
// carry no name in the SDE, so the label is the station operation's name
// (joined). No region filter — Pochven stations are valid build locations.
export type IndustryStation = {
  id: number;
  operationName: string;
  manufacturingCapable: boolean;
  researchCapable: boolean;
};

export async function getIndustryStationsForSystem(
  systemId: number,
): Promise<IndustryStation[]> {
  return db
    .select({
      id: eveNpcStations.id,
      operationName: eveStationOperations.name,
      manufacturingCapable: eveNpcStations.manufacturingCapable,
      researchCapable: eveNpcStations.researchCapable,
    })
    .from(eveNpcStations)
    .innerJoin(
      eveStationOperations,
      eq(eveStationOperations.id, eveNpcStations.operationId),
    )
    .where(
      and(
        eq(eveNpcStations.solarSystemId, systemId),
        eq(eveNpcStations.industryCapable, true),
      ),
    );
}

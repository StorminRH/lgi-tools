import { and, count, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { cacheLife, cacheTag } from 'next/cache';
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
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import {
  ACTIVITY_NAME_TO_ID,
  BLUEPRINT_STRUCTURE_TAG,
  INDUSTRY_ACTIVITY_NAMES,
  RIG_CAN_FIT_GROUP_ATTRS,
  SDE_INDUSTRY_STRUCTURE_GROUP_IDS,
  SDE_STRUCTURE_MODULE_CATEGORY_ID,
  STRUCTURE_RIG_SIZE_ATTR,
} from './constants';
import {
  isIndustryRig,
  type StructureRigOption,
  type StructureTypeOption,
} from './structures';
import {
  activitiesToRows,
  pickBuildTimeSeconds,
  type BlueprintActivities,
  type TreeNode,
} from './tree-resolver';
import {
  parseBlueprintActivities,
  type BlueprintActivitySet,
} from './activities';
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

// Cached count of buildable blueprints + reactions, for the home dashboard's
// status card. Deploy-static SDE data; the SDE refresh cron busts
// BLUEPRINT_STRUCTURE_TAG so a re-ingest is reflected without a deploy.
export async function getCachedBlueprintCount(): Promise<number> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(async () => {
    const [row] = await db.select({ n: count() }).from(industryBlueprints);
    return Number(row?.n ?? 0);
  });
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

// Batch-read the stored `activities` JSONB for the given blueprints and fold
// each row into a Map via `derive`. The per-activity reads below differ only in
// that fold, so the shared scaffolding (the empty-input guard, the single
// `inArray` select, the row loop) lives here once. `derive` returns null to omit
// a blueprint from the result.
async function mapBlueprintActivities<T>(
  blueprintTypeIds: number[],
  derive: (rawActivities: unknown) => T | null,
): Promise<Map<number, T>> {
  const out = new Map<number, T>();
  if (blueprintTypeIds.length === 0) return out;
  const rows = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
    })
    .from(industryBlueprints)
    .where(inArray(industryBlueprints.blueprintTypeId, blueprintTypeIds));
  for (const r of rows) {
    const value = derive(r.activities);
    if (value !== null) out.set(r.blueprintTypeId, value);
  }
  return out;
}

// The industry activity (1 = manufacturing, 11 = reaction) that produces each
// of the given blueprints, in one batched query — for labelling tree nodes by
// how they're made without an N+1. A blueprint carries at most one of {1, 11}
// (the resolver collapses the two on that basis); if one somehow carries both,
// we prefer manufacturing (the lower id), matching the structure read.
export async function getActivityByBlueprint(
  blueprintTypeIds: number[],
): Promise<Map<number, number>> {
  return mapBlueprintActivities(blueprintTypeIds, (raw) => {
    const activities = (raw ?? {}) as BlueprintActivities;
    // The activity (1 or 11) that actually yields a product; prefer
    // manufacturing (the lower id) — INDUSTRY_ACTIVITY_NAMES is ordered
    // manufacturing-first.
    for (const name of INDUSTRY_ACTIVITY_NAMES) {
      const act = activities[name];
      if (act?.products && act.products.length > 0) {
        return ACTIVITY_NAME_TO_ID[name];
      }
    }
    return null;
  });
}

// The base build TIME (CCP SDE `time`, SECONDS for a single run — ME0/TE0, no
// skill/structure/rig bonuses) of the manufacturing/reaction activity each given
// blueprint produces under, in one batched query. Feeds the planner's Build-time
// tile, which scales by runs and sums the tree client-side. A blueprint carries
// at most one of {manufacturing, reaction}; prefer manufacturing (the lower id),
// matching the structure read. Blueprints with no positive build time (the
// degenerate self-recipes) are simply absent from the map.
export async function getBlueprintActivityTimes(
  blueprintTypeIds: number[],
): Promise<Map<number, number>> {
  return mapBlueprintActivities(blueprintTypeIds, (raw) =>
    pickBuildTimeSeconds((raw ?? {}) as BlueprintActivities),
  );
}

// The FULL set of activities each blueprint carries — manufacturing, reaction,
// copying, research, and invention — with every activity's materials, products
// (invention products include per-run probability), skills, and time, in one
// batched read. Groundwork for the skills/fees and invention surfaces; the
// resolver's narrow manufacturing/reaction path (above) is untouched.
//
// Deliberately NO published-type join (unlike getBlueprintOutput /
// getBlueprintSearchRows): invention output BPCs and datacore materials are
// routinely unpublished, so a `published = true` filter would silently drop the
// very invention rows this read exists to expose. Pure number space — type IDs
// pass through unresolved.
export async function getBlueprintActivities(
  blueprintTypeIds: number[],
): Promise<Map<number, BlueprintActivitySet>> {
  return mapBlueprintActivities(blueprintTypeIds, (raw) =>
    parseBlueprintActivities(raw),
  );
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
// blueprint produces nothing under either — i.e. not a planner-buildable — OR
// when the blueprint type is unpublished (a CCP test/dev artifact the in-game
// client hides, e.g. the "Test Reaction Blueprint"). Reads the blueprint
// `activities` JSONB so the Industry Planner never touches the raw table directly.
export type BlueprintOutput = {
  productTypeId: number;
  quantity: number;
  activityId: number;
};

export async function getBlueprintOutput(
  blueprintId: number,
): Promise<BlueprintOutput | null> {
  // innerJoin + published filter: an unpublished blueprint type is not in-game
  // buildable, so it resolves to null here just like a non-manufacturable one —
  // keeping it out of the planner detail page and everything downstream of
  // getBlueprintStructure (build-location endpoint, homepage favorites).
  const [row] = await db
    .select({ activities: industryBlueprints.activities })
    .from(industryBlueprints)
    .innerJoin(eveTypes, eq(industryBlueprints.blueprintTypeId, eveTypes.id))
    .where(
      and(
        eq(industryBlueprints.blueprintTypeId, blueprintId),
        eq(eveTypes.published, true),
      ),
    )
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

// One row per (blueprint, manufacturing/reaction product) where BOTH the
// blueprint and its product are published, for the Industry Planner's blueprint
// search index. Filtering published products drops the degenerate self-recipe
// junk (those produce unpublished types); filtering published blueprints drops
// CCP test/dev artifacts (e.g. the unpublished "Test Reaction Blueprint") that
// the in-game client also hides.
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
    .from(industryBlueprints)
    .innerJoin(eveTypes, eq(industryBlueprints.blueprintTypeId, eveTypes.id))
    .where(eq(eveTypes.published, true));

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
// stations), with name + security for the picker label. No security/region
// filter: Pochven systems are included (3.5.1a), and since 3.7.2.2 widened the
// universe to J-space, Thera (the one wormhole system with NPC stations) now
// appears too — an additive new row; every prior K-space result is unchanged.
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
  // Full in-game station name (ESI-resolved), null until resolved — the picker
  // shows it (compacted) and falls back to `operationName` when it's null.
  name: string | null;
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
      name: eveNpcStations.name,
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

// ----- Upwell structures + industry rigs (3.7.9) ---------------------------

// The three industry-capable structure families (Engineering Complexes,
// Refineries, Citadels) the planner offers as build locations, with each one's
// SDE group + rig-size class. A structure carries no "role" — the bonus is
// computed per build node from the structure's own attrs plus whatever rigs fit.
// Deploy-static SDE data — cached `'max'`, busted by the SDE drift cron's tag.
export async function getStructureTypes(): Promise<StructureTypeOption[]> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(async () => {
    const rows = await db
      .select({
        id: eveTypes.id,
        name: eveTypes.name,
        groupId: eveTypes.groupId,
        attributes: typeDogma.attributes,
      })
      .from(eveTypes)
      .leftJoin(typeDogma, eq(typeDogma.typeId, eveTypes.id))
      .where(
        and(
          inArray(eveTypes.groupId, [...SDE_INDUSTRY_STRUCTURE_GROUP_IDS]),
          eq(eveTypes.published, true),
        ),
      );
    return rows
      .map((r) => {
        const attrs = (r.attributes ?? {}) as AttrMap;
        return {
          typeId: r.id,
          name: r.name,
          groupId: r.groupId,
          rigSize: attrs[STRUCTURE_RIG_SIZE_ATTR] ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

// Every industry-efficiency structure rig the planner models, with the structure
// groups it can fit (canFitShipGroup) + its rig-size class — the builder filters
// this list to the rigs that fit a chosen structure (group in canFitGroups, same
// rig size). Deploy-static SDE data, cached `'max'`.
export async function getStructureRigs(): Promise<StructureRigOption[]> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(async () => {
    const rows = await db
      .select({
        id: eveTypes.id,
        name: eveTypes.name,
        attributes: typeDogma.attributes,
      })
      .from(eveTypes)
      .innerJoin(eveGroups, eq(eveGroups.id, eveTypes.groupId))
      .innerJoin(typeDogma, eq(typeDogma.typeId, eveTypes.id))
      .where(
        and(
          eq(eveGroups.categoryId, SDE_STRUCTURE_MODULE_CATEGORY_ID),
          eq(eveTypes.published, true),
        ),
      );
    const out: StructureRigOption[] = [];
    for (const r of rows) {
      const attrs = (r.attributes ?? {}) as AttrMap;
      if (!isIndustryRig(attrs)) continue;
      const canFitGroups = RIG_CAN_FIT_GROUP_ATTRS.map((a) => attrs[a]).filter(
        (g): g is number => g !== undefined,
      );
      out.push({
        typeId: r.id,
        name: r.name,
        canFitGroups,
        rigSize: attrs[STRUCTURE_RIG_SIZE_ATTR] ?? null,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });
}

// Exact in-game name → typeId over the structures + industry rigs the planner
// models — the bounded lookup behind the structure-fit paste path (the parser's
// `resolveTypeId` callback). A pasted line that isn't one of these (a defensive
// rig, a service module) simply doesn't resolve and is dropped, which is exactly
// what we want: only industry structures + rigs enter a saved custom structure.
export async function getStructureFitNameIndex(): Promise<Map<string, number>> {
  const [types, rigs] = await Promise.all([getStructureTypes(), getStructureRigs()]);
  const index = new Map<string, number>();
  for (const t of types) index.set(t.name, t.typeId);
  for (const r of rigs) index.set(r.name, r.typeId);
  return index;
}

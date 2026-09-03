import { and, count, eq, inArray } from 'drizzle-orm';
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
} from './schema';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import {
  BLUEPRINT_STRUCTURE_TAG,
  SDE_INDUSTRY_STRUCTURE_GROUP_IDS,
  SDE_STRUCTURE_MODULE_CATEGORY_ID,
  STRUCTURE_RIG_SIZE_ATTR,
} from './constants';
import {
  shapeStructureRigs,
  type StructureRigOption,
  type StructureTypeOption,
} from './structures';
import {
  collectSearchPending,
  collectTrackedTypeIds,
  pickBlueprintOutput,
  pickProducingActivityId,
  resolveSearchRows,
  type BlueprintOutput,
  type BlueprintSearchRow,
} from './blueprint-shaping';
export type { BlueprintOutput, BlueprintSearchRow };
import type { SystemSearchEntry } from './systems-search';
import {
  pickBuildTimeSeconds,
  type BlueprintActivities,
  type TreeNode,
} from './tree-resolver';
import {
  parseBlueprintActivities,
  type BlueprintActivitySet,
} from './activities';
import type { AttrMap, EveType } from './types';
import type { AnyPgDb } from '@/lib/db-types';

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

export async function readShipMassByType(
  database: AnyPgDb,
  typeId: number,
): Promise<number | null> {
  const [row] = await database
    .select({ mass: eveTypes.mass })
    .from(eveTypes)
    .where(eq(eveTypes.id, typeId))
    .limit(1);
  return row?.mass ?? null;
}

export async function getCachedBlueprintCount(): Promise<number> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(async () => {
    const [row] = await db.select({ n: count() }).from(industryBlueprints);
    return Number(row?.n ?? 0);
  });
}

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
    result.set(r.typeId, r.attributes as AttrMap);
  }
  return result;
}

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

export async function getActivityByBlueprint(
  blueprintTypeIds: number[],
): Promise<Map<number, number>> {
  return mapBlueprintActivities(blueprintTypeIds, (raw) =>
    pickProducingActivityId((raw ?? {}) as BlueprintActivities),
  );
}

export async function getBlueprintActivityTimes(
  blueprintTypeIds: number[],
): Promise<Map<number, number>> {
  return mapBlueprintActivities(blueprintTypeIds, (raw) =>
    pickBuildTimeSeconds((raw ?? {}) as BlueprintActivities),
  );
}

export async function getBlueprintActivities(
  blueprintTypeIds: number[],
): Promise<Map<number, BlueprintActivitySet>> {
  return mapBlueprintActivities(blueprintTypeIds, (raw) =>
    parseBlueprintActivities(raw),
  );
}

export async function listTrackedTypeIds(db: AnyPgDb): Promise<number[]> {
  const rows = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
    })
    .from(industryBlueprints);
  return collectTrackedTypeIds(rows);
}

/**
 * The item a blueprint produces and how many per run, for the chosen industry
 * activity (manufacturing 1 preferred over reaction 11). `null` when the
 * blueprint produces nothing under either — i.e. not a planner-buildable — OR
 * when the blueprint type is unpublished (a CCP test/dev artifact the in-game
 * client hides, e.g. the "Test Reaction Blueprint"). Reads the blueprint
 * `activities` JSONB so the Industry Planner never touches the raw table directly.
 */
export async function getBlueprintOutput(
  blueprintId: number,
): Promise<BlueprintOutput | null> {
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
  return pickBlueprintOutput((row.activities ?? {}) as BlueprintActivities);
}

export async function getBlueprintSearchRows(): Promise<BlueprintSearchRow[]> {
  const rows = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
    })
    .from(industryBlueprints)
    .innerJoin(eveTypes, eq(industryBlueprints.blueprintTypeId, eveTypes.id))
    .where(eq(eveTypes.published, true));

  const { pending, productIds } = collectSearchPending(rows);
  if (productIds.size === 0) return [];

  const nameRows = await db
    .select({ id: eveTypes.id, name: eveTypes.name })
    .from(eveTypes)
    .where(and(inArray(eveTypes.id, [...productIds]), eq(eveTypes.published, true)));
  return resolveSearchRows(pending, nameRows);
}

export async function getSystemSearchIndex(): Promise<SystemSearchEntry[]> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  const systems = await withColdStartRetry(() =>
    db
      .select({
        id: eveSolarSystems.id,
        name: eveSolarSystems.name,
        security: eveSolarSystems.securityStatus,
      })
      .from(eveSolarSystems),
  );
  return systems.sort((a, b) => a.name.localeCompare(b.name));
}

export async function solarSystemExists(systemId: number): Promise<boolean> {
  const rows = await db
    .select({ id: eveSolarSystems.id })
    .from(eveSolarSystems)
    .where(eq(eveSolarSystems.id, systemId))
    .limit(1);
  return rows.length > 0;
}

export type IndustryStation = {
  id: number;
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
    return shapeStructureRigs(rows);
  });
}

export async function getStructureFitNameIndex(): Promise<Map<string, number>> {
  const [types, rigs] = await Promise.all([getStructureTypes(), getStructureRigs()]);
  const index = new Map<string, number>();
  for (const t of types) index.set(t.name, t.typeId);
  for (const r of rigs) index.set(r.name, r.typeId);
  return index;
}

import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '@/db';
import {
  blueprintFlatMaterials,
  blueprintTrees,
  dgmTypeAttributes,
  eveCategories,
  eveDataMeta,
  eveGroups,
  eveTypes,
  industryActivityMaterials,
  industryActivityProducts,
} from '@/db/schema';
import { INDUSTRY_ACTIVITY_IDS } from './constants';
import type { TreeNode } from './tree-resolver';
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

// Returns a lowercase-name-keyed map. If two types share a name (rare but
// happens for retired/republished items), the published one wins.
export async function getTypesByNames(names: string[]): Promise<Map<string, EveType>> {
  if (names.length === 0) return new Map();
  const lowered = names.map((n) => n.toLowerCase());
  const rows = await db
    .select(TYPE_COLUMNS)
    .from(eveTypes)
    .where(inArray(sql`lower(${eveTypes.name})`, lowered))
    .orderBy(desc(eveTypes.published));
  const out = new Map<string, EveType>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    if (!out.has(key)) out.set(key, r);
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
    .select({
      typeId: dgmTypeAttributes.typeId,
      attributeId: dgmTypeAttributes.attributeId,
      value: dgmTypeAttributes.value,
    })
    .from(dgmTypeAttributes)
    .where(inArray(dgmTypeAttributes.typeId, typeIds));
  for (const r of rows) {
    const map = result.get(r.typeId);
    if (map) map[r.attributeId] = r.value;
  }
  return result;
}

// ----- Industry-side helpers ------------------------------------------

export type FlatMaterial = { rawMaterialTypeId: number; totalQuantity: bigint };

// Pre-computed flat materials for one blueprint. Returns [] when the
// resolver hasn't seen this blueprint yet (e.g. a brand-new SDE patch
// added a blueprint but the tree resolver hasn't been re-run). UI must
// handle the empty case gracefully (banner: "blueprint pending
// resolution"); the next cron tick fills it.
export async function getFlatMaterials(blueprintId: number): Promise<FlatMaterial[]> {
  return db
    .select({
      rawMaterialTypeId: blueprintFlatMaterials.rawMaterialTypeId,
      totalQuantity: blueprintFlatMaterials.totalQuantity,
    })
    .from(blueprintFlatMaterials)
    .where(eq(blueprintFlatMaterials.blueprintTypeId, blueprintId));
}

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

// Union of all type IDs that appear as either a material input OR a
// product output under manufacturing/reactions. This is the set we
// upsert into `market_prices` after every SDE ingest; on conflict we
// preserve existing prices, so the existing 54 wormhole-site rows stay
// intact and the ~6,000 new types arrive with NULL prices + epoch
// staleness for the next cron tick to fill.
export async function listTrackedTypeIds(db: AnyPgDb): Promise<number[]> {
  const activityIds = [...INDUSTRY_ACTIVITY_IDS];

  const materialRows = await db
    .selectDistinct({ id: industryActivityMaterials.materialTypeId })
    .from(industryActivityMaterials)
    .where(inArray(industryActivityMaterials.activityId, activityIds));

  const productRows = await db
    .selectDistinct({ id: industryActivityProducts.productTypeId })
    .from(industryActivityProducts)
    .where(inArray(industryActivityProducts.activityId, activityIds));

  const set = new Set<number>();
  for (const r of materialRows) set.add(r.id);
  for (const r of productRows) set.add(r.id);
  return [...set];
}

// ----- SDE meta key/value -------------------------------------------

export async function getSdeMetaValue(db: AnyPgDb, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: eveDataMeta.value })
    .from(eveDataMeta)
    .where(eq(eveDataMeta.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function setSdeMetaValue(
  db: AnyPgDb,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(eveDataMeta)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eveDataMeta.key,
      set: { value, updatedAt: new Date() },
    });
}

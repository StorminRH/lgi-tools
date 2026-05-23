import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { eveCategories, eveGroups, eveTypes } from '@/db/schema';
import type { EveCategory, EveGroup, EveType } from './types';

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

const GROUP_COLUMNS = {
  id: eveGroups.id,
  categoryId: eveGroups.categoryId,
  name: eveGroups.name,
  iconId: eveGroups.iconId,
  useBasePrice: eveGroups.useBasePrice,
  anchored: eveGroups.anchored,
  anchorable: eveGroups.anchorable,
  fittableNonSingleton: eveGroups.fittableNonSingleton,
  published: eveGroups.published,
} as const;

const CATEGORY_COLUMNS = {
  id: eveCategories.id,
  name: eveCategories.name,
  iconId: eveCategories.iconId,
  published: eveCategories.published,
} as const;

export async function getType(id: number): Promise<EveType | null> {
  const [row] = await db.select(TYPE_COLUMNS).from(eveTypes).where(eq(eveTypes.id, id));
  return row ?? null;
}

// Case-insensitive lookup. If two types share a name (rare but happens for
// retired/republished items), the published one wins.
export async function getTypeByName(name: string): Promise<EveType | null> {
  const [row] = await db
    .select(TYPE_COLUMNS)
    .from(eveTypes)
    .where(sql`lower(${eveTypes.name}) = ${name.toLowerCase()}`)
    .orderBy(desc(eveTypes.published))
    .limit(1);
  return row ?? null;
}

export async function getTypesByIds(ids: number[]): Promise<EveType[]> {
  if (ids.length === 0) return [];
  return db.select(TYPE_COLUMNS).from(eveTypes).where(inArray(eveTypes.id, ids));
}

// Returns a lowercase-name-keyed map. Same published-wins rule as the singular.
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

export async function getGroup(id: number): Promise<EveGroup | null> {
  const [row] = await db.select(GROUP_COLUMNS).from(eveGroups).where(eq(eveGroups.id, id));
  return row ?? null;
}

export async function getCategory(id: number): Promise<EveCategory | null> {
  const [row] = await db
    .select(CATEGORY_COLUMNS)
    .from(eveCategories)
    .where(eq(eveCategories.id, id));
  return row ?? null;
}

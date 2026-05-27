import { desc, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { dgmTypeAttributes, eveTypes } from '@/db/schema';
import type { AttrMap, EveType } from './types';

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

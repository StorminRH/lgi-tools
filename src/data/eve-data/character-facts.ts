import { and, eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { getOrInsertComputed } from '@/lib/array';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import {
  ATTRIBUTE_BONUS_DOGMA_NAMES,
  ATTRIBUTE_KEYS,
  type AttributeKey,
  IMPLANT_SLOT_DOGMA,
  SKILL_RANK_DOGMA,
} from './character-attributes';
import { SDE_CACHE_TAG, SDE_SKILL_CATEGORY_ID } from './constants';
import { getTypeAttributesBatch } from './queries';
import { dgmAttributeTypes, eveGroups, eveNpcStations, eveSolarSystems, eveTypes, typeDogma } from './schema';
import { type SecurityClass, systemSecurityClass } from './security';
import type { AttrMap } from './types';

export interface SystemFacts {
  name: string;
  security: number | null;
  secClass: SecurityClass;
}

export async function getSystemFacts(ids: number[]): Promise<Map<number, SystemFacts>> {
  const out = new Map<number, SystemFacts>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: eveSolarSystems.id,
      name: eveSolarSystems.name,
      security: eveSolarSystems.securityStatus,
      wormholeClassId: eveSolarSystems.wormholeClassId,
    })
    .from(eveSolarSystems)
    .where(inArray(eveSolarSystems.id, ids));
  for (const row of rows) {
    out.set(row.id, {
      name: row.name,
      security: row.security,
      secClass: systemSecurityClass(row.security, row.wormholeClassId),
    });
  }
  return out;
}

export interface NpcStationFacts {
  name: string | null;
  systemId: number;
}

export async function getNpcStationFacts(ids: number[]): Promise<Map<number, NpcStationFacts>> {
  const out = new Map<number, NpcStationFacts>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: eveNpcStations.id, name: eveNpcStations.name, systemId: eveNpcStations.solarSystemId })
    .from(eveNpcStations)
    .where(inArray(eveNpcStations.id, ids));
  for (const row of rows) out.set(row.id, { name: row.name, systemId: row.systemId });
  return out;
}

const DOGMA_NAMES = [IMPLANT_SLOT_DOGMA, SKILL_RANK_DOGMA, ...Object.values(ATTRIBUTE_BONUS_DOGMA_NAMES)];

async function dogmaAttributeIds(): Promise<Record<string, number>> {
  'use cache';
  cacheLife('max');
  cacheTag(SDE_CACHE_TAG);
  const rows = await withColdStartRetry(() =>
    db
      .select({ id: dgmAttributeTypes.id, name: dgmAttributeTypes.name })
      .from(dgmAttributeTypes)
      .where(inArray(dgmAttributeTypes.name, DOGMA_NAMES)),
  );
  return Object.fromEntries(rows.map((row) => [row.name, row.id]));
}

function attributeValue(attrs: AttrMap, ids: Record<string, number>, name: string): number | null {
  const id = ids[name];
  return id === undefined ? null : (attrs[id] ?? null);
}

export interface ImplantDogma {
  slot: number | null;
  bonus: Partial<Record<AttributeKey, number>>;
}

export async function getImplantDogma(typeIds: number[]): Promise<Map<number, ImplantDogma>> {
  const out = new Map<number, ImplantDogma>();
  if (typeIds.length === 0) return out;
  const [ids, attrsByType] = await Promise.all([dogmaAttributeIds(), getTypeAttributesBatch(typeIds)]);
  for (const [typeId, attrs] of attrsByType) {
    const bonus: Partial<Record<AttributeKey, number>> = {};
    for (const key of ATTRIBUTE_KEYS) {
      const value = attributeValue(attrs, ids, ATTRIBUTE_BONUS_DOGMA_NAMES[key]);
      if (value !== null && value !== 0) bonus[key] = value;
    }
    out.set(typeId, { slot: attributeValue(attrs, ids, IMPLANT_SLOT_DOGMA), bonus });
  }
  return out;
}

export interface TypeMarketFacts {
  categoryId: number;
  marketGroupId: number | null;
  published: boolean;
}

/** Category, market group and published flag per type: the valuation's exclusions and the price-seed filter. */
export async function getTypeMarketFacts(typeIds: number[]): Promise<Map<number, TypeMarketFacts>> {
  const out = new Map<number, TypeMarketFacts>();
  if (typeIds.length === 0) return out;
  const rows = await db
    .select({
      id: eveTypes.id,
      categoryId: eveGroups.categoryId,
      marketGroupId: eveTypes.marketGroupId,
      published: eveTypes.published,
    })
    .from(eveTypes)
    .innerJoin(eveGroups, eq(eveGroups.id, eveTypes.groupId))
    .where(inArray(eveTypes.id, typeIds));
  for (const row of rows) {
    out.set(row.id, { categoryId: row.categoryId, marketGroupId: row.marketGroupId, published: row.published });
  }
  return out;
}

export interface CatalogSkill {
  typeId: number;
  name: string;
  rank: number;
}

export interface CatalogGroup {
  groupId: number;
  name: string;
  skills: CatalogSkill[];
}

const FALLBACK_SKILL_RANK = 1;

export async function getSkillCatalog(): Promise<CatalogGroup[]> {
  'use cache';
  cacheLife('max');
  cacheTag(SDE_CACHE_TAG);
  const [ids, rows] = await Promise.all([
    dogmaAttributeIds(),
    withColdStartRetry(() =>
      db
        .select({
          typeId: eveTypes.id,
          name: eveTypes.name,
          groupId: eveGroups.id,
          groupName: eveGroups.name,
          attributes: typeDogma.attributes,
        })
        .from(eveTypes)
        .innerJoin(eveGroups, eq(eveGroups.id, eveTypes.groupId))
        .leftJoin(typeDogma, eq(typeDogma.typeId, eveTypes.id))
        .where(and(eq(eveGroups.categoryId, SDE_SKILL_CATEGORY_ID), eq(eveTypes.published, true))),
    ),
  ]);
  const groups = new Map<number, CatalogGroup>();
  for (const row of rows) {
    const group = getOrInsertComputed(groups, row.groupId, () => ({
      groupId: row.groupId,
      name: row.groupName,
      skills: [],
    }));
    const rank = attributeValue(row.attributes ?? {}, ids, SKILL_RANK_DOGMA);
    group.skills.push({ typeId: row.typeId, name: row.name, rank: rank ?? FALLBACK_SKILL_RANK });
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return [...groups.values()]
    .map((group) => ({ ...group, skills: [...group.skills].sort(byName) }))
    .sort(byName);
}

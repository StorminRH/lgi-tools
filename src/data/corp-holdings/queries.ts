import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { isUniqueViolation } from '@/db/pg-errors';
import { chunk } from '@/lib/array';
import { buildCorpHoldingContext, type CorpProfile, type MemberBase } from './context';
import { type CorpHoldingContext, type HoldingIndex, toHoldingNodes } from './placement';
import { corpHoldingNodes, corpMemberBases, corpProfiles } from './schema';

const NODE_INSERT_BATCH = 1000;

function holdingsTag(corporationId: number): string {
  return `corp-holdings:${corporationId}`;
}

function profileTag(corporationId: number): string {
  return `corp-profile:${corporationId}`;
}

async function readCorpHoldingRows(corporationId: number) {
  'use cache';
  cacheLife('hours');
  cacheTag(holdingsTag(corporationId), profileTag(corporationId));
  const [nodes, profiles] = await Promise.all([
    db
      .select({
        itemId: corpHoldingNodes.itemId,
        kind: corpHoldingNodes.kind,
        rootId: corpHoldingNodes.rootId,
        division: corpHoldingNodes.division,
        deliveries: corpHoldingNodes.deliveries,
        containers: corpHoldingNodes.containers,
      })
      .from(corpHoldingNodes)
      .where(eq(corpHoldingNodes.corporationId, corporationId)),
    db
      .select({
        hqStationId: corpProfiles.hqStationId,
        divisionNames: corpProfiles.divisionNames,
        containerNames: corpProfiles.containerNames,
        structureNames: corpProfiles.structureNames,
      })
      .from(corpProfiles)
      .where(eq(corpProfiles.corporationId, corporationId))
      .limit(1),
  ]);
  return { nodes, profile: profiles[0] ?? null };
}

/** Per corp and viewer-independent, so the row read is shared across viewers. */
export async function getCorpHoldingContext(corporationId: number): Promise<CorpHoldingContext> {
  const { nodes, profile } = await readCorpHoldingRows(corporationId);
  return buildCorpHoldingContext(corporationId, nodes, profile);
}

export async function saveHoldingNodes(
  corporationId: number,
  index: HoldingIndex,
  refreshedAt: Date,
): Promise<'saved' | 'superseded'> {
  const rows = toHoldingNodes(index).map((node) => ({
    ...node,
    corporationId,
    refreshedAt,
    containers: [...node.containers],
  }));
  await db.delete(corpHoldingNodes).where(eq(corpHoldingNodes.corporationId, corporationId));
  try {
    for (const batch of chunk(rows, NODE_INSERT_BATCH)) await db.insert(corpHoldingNodes).values(batch);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return 'superseded';
  }
  revalidateTag(holdingsTag(corporationId), 'max');
  return 'saved';
}

/**
 * Bases are keyed by character, so a member who moved corps is re-keyed by
 * the upsert rather than colliding with their stale row under the old corp.
 * Members no longer in the set are deleted first.
 */
export async function saveCorpProfile(
  corporationId: number,
  profile: CorpProfile,
  bases: readonly MemberBase[],
  refreshedAt: Date,
): Promise<void> {
  await db
    .insert(corpProfiles)
    .values({ corporationId, ...profile, lastRefreshedAt: refreshedAt })
    .onConflictDoUpdate({ target: corpProfiles.corporationId, set: { ...profile, lastRefreshedAt: refreshedAt } });
  const kept = bases.map((base) => base.characterId);
  await db
    .delete(corpMemberBases)
    .where(and(eq(corpMemberBases.corporationId, corporationId), notInArray(corpMemberBases.characterId, kept)));
  if (bases.length > 0) {
    await db
      .insert(corpMemberBases)
      .values(bases.map((base) => ({ corporationId, ...base })))
      .onConflictDoUpdate({
        target: corpMemberBases.characterId,
        set: { corporationId, baseId: sql`excluded.base_id` },
      });
  }
  revalidateTag(profileTag(corporationId), 'max');
}

export async function readCorpProfileState(corporationId: number): Promise<{ lastRefreshedAt: Date } | null> {
  const rows = await db
    .select({ lastRefreshedAt: corpProfiles.lastRefreshedAt })
    .from(corpProfiles)
    .where(eq(corpProfiles.corporationId, corporationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function stampCorpProfileFresh(corporationId: number, refreshedAt: Date): Promise<void> {
  await db
    .update(corpProfiles)
    .set({ lastRefreshedAt: refreshedAt })
    .where(eq(corpProfiles.corporationId, corporationId));
}

export async function readMemberBases(
  corporationId: number,
  characterIds: readonly number[],
): Promise<Map<number, number | null>> {
  if (characterIds.length === 0) return new Map();
  const rows = await db
    .select({ characterId: corpMemberBases.characterId, baseId: corpMemberBases.baseId })
    .from(corpMemberBases)
    .where(and(eq(corpMemberBases.corporationId, corporationId), inArray(corpMemberBases.characterId, [...characterIds])));
  return new Map(rows.map((row) => [row.characterId, row.baseId]));
}

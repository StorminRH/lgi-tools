import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { insertInBatches, replaceOwnerSnapshot } from '@/db/snapshot-replace';
import { expireNow } from '@/lib/cache-expiry';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { excluded } from '@/lib/db-upsert';
import { buildCorpHoldingContext, type CorpProfile, type MemberBase } from './context';
import { type CorpHoldingContext, type HoldingIndex, toHoldingNodes } from './placement';
import { corpHoldingNodes, corpMemberBases, corpProfiles } from './schema';

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

export async function getCorpHoldingContext(corporationId: number): Promise<CorpHoldingContext> {
  const { nodes, profile } = await readCorpHoldingRows(corporationId);
  return buildCorpHoldingContext(corporationId, nodes, profile);
}

/**
 * Replace a corporation's placement tree on the caller's transaction. It
 * neither swallows a unique violation nor invalidates: the transaction owner
 * maps a lost race to 'superseded' and calls invalidateHoldingNodes after commit.
 */
export async function replaceHoldingNodes(
  tx: AnyPgDb,
  corporationId: number,
  index: HoldingIndex,
  refreshedAt: Date,
): Promise<void> {
  await tx.delete(corpHoldingNodes).where(eq(corpHoldingNodes.corporationId, corporationId));
  await insertInBatches(tx, corpHoldingNodes, toHoldingNodes(index).map((node) => ({
    ...node,
    corporationId,
    refreshedAt,
    containers: [...node.containers],
  })));
}

export function invalidateHoldingNodes(corporationId: number): void {
  expireNow(holdingsTag(corporationId));
}

/**
 * The profile upsert takes the corporation's lock before its member bases are
 * replaced, so freshness, HQ, and bases commit together as one authorization
 * snapshot. Null bases keep the stored ones: the tracking answer was unchanged.
 */
export async function saveCorpProfile(
  corporationId: number,
  profile: CorpProfile,
  bases: readonly MemberBase[] | null,
  refreshedAt: Date,
  options: { database?: PostgresJsDb } = {},
): Promise<void> {
  const outcome = await replaceOwnerSnapshot({
    lock: (tx) => tx
      .insert(corpProfiles)
      .values({ corporationId, ...profile, lastRefreshedAt: refreshedAt })
      .onConflictDoUpdate({ target: corpProfiles.corporationId, set: { ...profile, lastRefreshedAt: refreshedAt } }),
    replace: async (tx) => {
      if (bases === null) return;
      await tx
        .delete(corpMemberBases)
        .where(and(
          eq(corpMemberBases.corporationId, corporationId),
          notInArray(corpMemberBases.characterId, bases.map((base) => base.characterId)),
        ));
      if (bases.length === 0) return;
      await tx
        .insert(corpMemberBases)
        .values(bases.map((base) => ({ corporationId, ...base })))
        .onConflictDoUpdate({
          target: corpMemberBases.characterId,
          set: { corporationId, baseId: excluded(corpMemberBases.baseId) },
        });
    },
  }, options.database);
  if (outcome === 'saved') expireNow(profileTag(corporationId));
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

export async function readCorpMemberContext(
  corporationId: number,
  characterIds: readonly number[],
): Promise<{ lastRefreshedAt: Date; hqStationId: number | null; bases: Map<number, number | null> } | null> {
  const rows = await db
    .select({
      lastRefreshedAt: corpProfiles.lastRefreshedAt,
      hqStationId: corpProfiles.hqStationId,
      characterId: corpMemberBases.characterId,
      baseId: corpMemberBases.baseId,
    })
    .from(corpProfiles)
    .leftJoin(corpMemberBases, and(
      eq(corpMemberBases.corporationId, corpProfiles.corporationId),
      inArray(corpMemberBases.characterId, [...characterIds]),
    ))
    .where(eq(corpProfiles.corporationId, corporationId));
  const profile = rows[0];
  if (profile === undefined) return null;
  return {
    lastRefreshedAt: profile.lastRefreshedAt,
    hqStationId: profile.hqStationId,
    bases: new Map(rows.flatMap((row) => row.characterId === null ? [] : [[row.characterId, row.baseId]])),
  };
}

import { and, eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { datasetTag, storedExpiry, untilExpires } from '@/data/esi-store';
import { db } from '@/db';
import { insertInBatches, replaceOwnerSnapshot } from '@/db/snapshot-replace';
import { ownerKeyWhere } from '@/lib/db-columns';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { buildHoldingIndex, type CorpAssetEvidence, type HoldingIndex, parseCorpAssetItems } from '@/data/corp-holdings/placement';
import { replaceHoldingNodes } from '@/data/corp-holdings/queries';
import { decryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import { readCorpAssetSnapshots } from '@/data/esi-snapshots/queries';
import { type CorpGrant, type OwnedReadScope } from '@/platform/auth/corp-visibility';
import {
  type AssetMapInput,
  type AssetRow,
  buildOwnedAssetMap,
  characterAssetInputs,
  type OwnedAssetMap,
  visibleCorpAssetInputs,
} from './asset-map';
import type { OwnedAsset } from './esi-projection';
import { ownedAssetsKey } from './keys';
import { type OwnerKey, ownedResourcePath, type PagedOwnerSyncState } from '@/platform/owner-sync';
import { OWNED_ASSETS_RESOURCE } from './refresh';
import { ownedAssets, ownedAssetSyncs } from './schema';

/** One owner's asset rows, cached across instances until the stored paged answer behind them expires. */
async function getOwnerAssetRows(owner: OwnerKey): Promise<AssetRow[]> {
  'use cache: remote';
  const key = ownedAssetsKey(owner);
  cacheTag(datasetTag(key));
  const [rows, expiresAt] = await Promise.all([readOwnerAssetRows(owner), storedExpiry([key])]);
  cacheLife(untilExpires(expiresAt));
  return rows;
}

export async function readOwnerAssetRows(owner: OwnerKey): Promise<AssetRow[]> {
  return db
    .select({
      typeId: ownedAssets.typeId,
      quantity: ownedAssets.quantity,
      locationId: ownedAssets.locationId,
      locationFlag: ownedAssets.locationFlag,
      locationType: ownedAssets.locationType,
    })
    .from(ownedAssets)
    .where(ownerKeyWhere(ownedAssets, owner));
}

async function characterInputs(characterId: number): Promise<AssetMapInput[]> {
  return characterAssetInputs(await getOwnerAssetRows({ ownerType: 'character', ownerId: characterId }), characterId);
}

async function getCorpAssetSnapshot(corporationId: number) {
  'use cache: remote';
  const owner: OwnerKey = { ownerType: 'corporation', ownerId: corporationId };
  const key = ownedAssetsKey(owner);
  cacheTag(datasetTag(key));
  const [rows, expiresAt] = await Promise.all([
    db.select().from(ownedAssets).where(ownerKeyWhere(ownedAssets, owner)),
    storedExpiry([key]),
  ]);
  cacheLife(untilExpires(expiresAt));
  const ids = [...new Set(rows.flatMap((row) => row.snapshotId === null ? [] : [row.snapshotId]))];
  const snapshots = await readCorpAssetSnapshots(corporationId, ownedResourcePath(OWNED_ASSETS_RESOURCE, owner), ids);
  return snapshots.flatMap((snapshot) => {
    const body = decryptSnapshotBody(snapshot.bodyCiphertext);
    const items = Array.isArray(body) ? parseCorpAssetItems(body) : null;
    return items === null ? [] : [{
      rows: rows.filter((row) => row.snapshotId === snapshot.id),
      complete: rows.every((row) => row.snapshotId === snapshot.id),
      index: buildHoldingIndex(items),
      items,
    }];
  });
}

export async function getCorpAssetEvidence(corporationId: number): Promise<CorpAssetEvidence | null> {
  const snapshots = await getCorpAssetSnapshot(corporationId);
  if (snapshots.length !== 1 || !snapshots[0]!.complete) return null;
  const { index, items } = snapshots[0]!;
  return { corporationId, index, items };
}

async function corpInputs(grant: CorpGrant): Promise<AssetMapInput[]> {
  const snapshots = await getCorpAssetSnapshot(grant.corporationId);
  return snapshots.flatMap(({ rows, index }) => visibleCorpAssetInputs(rows, {
    ...grant, context: { ...grant.context, index },
  }));
}

export async function getOwnedAssetMap(scope: OwnedReadScope, typeIds: number[]): Promise<OwnedAssetMap> {
  const [characters, corps] = await Promise.all([
    Promise.all(scope.characterIds.map(characterInputs)),
    Promise.all(scope.corps.map(corpInputs)),
  ]);
  return buildOwnedAssetMap([...characters.flat(), ...corps.flat()], typeIds);
}

/** Every stored row per character, for valuation; characters without rows map to an empty list. */
export async function listCharacterAssetRows(characterIds: number[]): Promise<Map<number, AssetRow[]>> {
  return mapByIdDroppingNulls(characterIds, (ownerId) => getOwnerAssetRows({ ownerType: 'character', ownerId }));
}

const syncStateColumns = {
  lastRefreshedAt: ownedAssetSyncs.lastRefreshedAt,
};

export async function readOwnerSyncState(owner: OwnerKey): Promise<PagedOwnerSyncState | null> {
  const rows = await db
    .select(syncStateColumns)
    .from(ownedAssetSyncs)
    .where(ownerKeyWhere(ownedAssetSyncs, owner))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Uncached, in one query: each listed character's asset sync state; a character with no row is absent.
 * The owner-type filter keeps a corporation that shares a numeric id out of the result.
 */
export async function listCharacterAssetSyncStates(
  characterIds: number[],
): Promise<Map<number, PagedOwnerSyncState>> {
  if (characterIds.length === 0) return new Map();
  const rows = await db
    .select({ ownerId: ownedAssetSyncs.ownerId, ...syncStateColumns })
    .from(ownedAssetSyncs)
    .where(and(eq(ownedAssetSyncs.ownerType, 'character'), inArray(ownedAssetSyncs.ownerId, characterIds)));
  return new Map(rows.map(({ ownerId, ...state }) => [ownerId, state]));
}

/** Upsert the owner's sync row with the new etags: the first step of every replace, and the lock it holds. */
function upsertAssetSync(owner: OwnerKey, etags: string[], now: Date) {
  return (tx: AnyPgDb) => tx
    .insert(ownedAssetSyncs)
    .values({ ownerType: owner.ownerType, ownerId: owner.ownerId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({
      target: [ownedAssetSyncs.ownerType, ownedAssetSyncs.ownerId],
      set: { lastRefreshedAt: now, pageEtags: etags },
    });
}

/** Delete and re-insert the owner's rows on the caller's transaction. */
async function replaceOwnerAssetRows(
  tx: AnyPgDb,
  owner: OwnerKey,
  rows: OwnedAsset[],
  snapshotId: number | null,
): Promise<void> {
  await tx.delete(ownedAssets).where(ownerKeyWhere(ownedAssets, owner));
  await insertInBatches(tx, ownedAssets, rows.map((r) => ({
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    typeId: r.type_id,
    quantity: r.quantity,
    locationId: r.location_id,
    locationFlag: r.location_flag,
    locationType: r.location_type,
    snapshotId,
  })));
}

/**
 * Publish a character's assets under its sync-row lock; a unique violation
 * is 'superseded' and changes nothing. The sync's commit clears the cache
 * tag once the answer behind these rows is recorded.
 */
export function saveOwnedAssets(
  owner: OwnerKey,
  rows: OwnedAsset[],
  etags: string[],
): Promise<'saved' | 'superseded'> {
  return replaceOwnerSnapshot({
    lock: upsertAssetSync(owner, etags, new Date()),
    replace: (tx) => replaceOwnerAssetRows(tx, owner, rows, null),
  });
}

export async function stampOwnerFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedAssetSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(ownerKeyWhere(ownedAssetSyncs, owner));
}

/** Publish corporation contents and placement nodes under one serialized commit; the sync's commit clears the tag. */
export function saveCorpOwnedAssets(
  corporationId: number,
  index: HoldingIndex,
  rows: OwnedAsset[],
  etags: string[],
  snapshotId: number,
  options: { database?: PostgresJsDb } = {},
): Promise<'saved' | 'superseded'> {
  const owner = { ownerType: 'corporation', ownerId: corporationId } as const;
  const refreshedAt = new Date();
  return replaceOwnerSnapshot({
    lock: upsertAssetSync(owner, etags, refreshedAt),
    replace: async (tx) => {
      await replaceHoldingNodes(tx, corporationId, index, refreshedAt);
      await replaceOwnerAssetRows(tx, owner, rows, snapshotId);
    },
  }, options.database);
}

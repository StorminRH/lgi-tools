import { and, eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { drizzle } from 'drizzle-orm/postgres-js';
import { db, directClient, resolveLockConnectionUrl } from '@/db';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { buildHoldingIndex, type CorpAssetEvidence, type HoldingIndex, parseCorpAssetItems } from '@/data/corp-holdings/placement';
import { invalidateHoldingNodes, saveHoldingNodes } from '@/data/corp-holdings/queries';
import { decryptSnapshotBody } from '@/data/esi-snapshots/crypto';
import { readCorpAssetSnapshots } from '@/data/esi-snapshots/queries';
import { isUniqueViolation } from '@/db/pg-errors';
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
import type { OwnerKey, PagedOwnerSyncState } from '@/platform/owner-sync';
import { ownedAssets, ownedAssetSyncs } from './schema';

function ownedAssetsTag(owner: OwnerKey): string {
  return `owned-assets:${owner.ownerType}:${owner.ownerId}`;
}

async function getOwnerAssetRows(owner: OwnerKey): Promise<AssetRow[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(ownedAssetsTag(owner));
  return readOwnerAssetRows(owner);
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
    .where(and(eq(ownedAssets.ownerType, owner.ownerType), eq(ownedAssets.ownerId, owner.ownerId)));
}

async function characterInputs(characterId: number): Promise<AssetMapInput[]> {
  return characterAssetInputs(await getOwnerAssetRows({ ownerType: 'character', ownerId: characterId }), characterId);
}

async function getCorpAssetSnapshot(corporationId: number) {
  'use cache';
  cacheLife('hours');
  cacheTag(ownedAssetsTag({ ownerType: 'corporation', ownerId: corporationId }));
  const rows = await db.select().from(ownedAssets).where(and(
    eq(ownedAssets.ownerType, 'corporation'), eq(ownedAssets.ownerId, corporationId),
  ));
  const ids = [...new Set(rows.flatMap((row) => row.snapshotId === null ? [] : [row.snapshotId]))];
  const snapshots = await readCorpAssetSnapshots(corporationId, ids);
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
  const perOwner = await Promise.all(
    characterIds.map((ownerId) => getOwnerAssetRows({ ownerType: 'character', ownerId })),
  );
  return new Map(characterIds.map((id, i) => [id, perOwner[i] ?? []]));
}

export async function readOwnerSyncState(owner: OwnerKey): Promise<PagedOwnerSyncState | null> {
  const rows = await db
    .select({
      lastRefreshedAt: ownedAssetSyncs.lastRefreshedAt,
      pageEtags: ownedAssetSyncs.pageEtags,
    })
    .from(ownedAssetSyncs)
    .where(and(eq(ownedAssetSyncs.ownerType, owner.ownerType), eq(ownedAssetSyncs.ownerId, owner.ownerId)))
    .limit(1);
  const row = rows[0];
  return row ? { lastRefreshedAt: row.lastRefreshedAt, pageEtags: row.pageEtags } : null;
}

export async function saveOwnedAssets(
  owner: OwnerKey,
  rows: OwnedAsset[],
  etags: string[],
  snapshotId: number | null = null,
  database: AnyPgDb = db,
): Promise<'saved' | 'superseded'> {
  const now = new Date();
  await database
    .delete(ownedAssets)
    .where(and(eq(ownedAssets.ownerType, owner.ownerType), eq(ownedAssets.ownerId, owner.ownerId)));
  if (rows.length > 0) {
    try {
      await database.insert(ownedAssets).values(
        rows.map((r) => ({
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          typeId: r.type_id,
          quantity: r.quantity,
          locationId: r.location_id,
          locationFlag: r.location_flag,
          locationType: r.location_type,
          snapshotId,
        })),
      );
    } catch (error) {
      if (database !== db || !isUniqueViolation(error)) throw error;
      return 'superseded';
    }
  }
  await database
    .insert(ownedAssetSyncs)
    .values({ ownerType: owner.ownerType, ownerId: owner.ownerId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({
      target: [ownedAssetSyncs.ownerType, ownedAssetSyncs.ownerId],
      set: { lastRefreshedAt: now, pageEtags: etags },
    });
  if (database === db) revalidateTag(ownedAssetsTag(owner), 'max');
  return 'saved';
}

export async function stampOwnerFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedAssetSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(and(eq(ownedAssetSyncs.ownerType, owner.ownerType), eq(ownedAssetSyncs.ownerId, owner.ownerId)));
}

/** Publish corporation contents and placement nodes under one serialized commit. */
export async function saveCorpOwnedAssets(
  corporationId: number,
  index: HoldingIndex,
  rows: OwnedAsset[],
  etags: string[],
  snapshotId: number,
  options: { database?: PostgresJsDb } = {},
): Promise<'saved' | 'superseded'> {
  let database = options.database;
  if (database === undefined) {
    resolveLockConnectionUrl();
    database = drizzle(directClient);
  }
  const owner = { ownerType: 'corporation', ownerId: corporationId } as const;
  try {
    await database.transaction(async (tx) => {
      // Upsert first: it locks even a corporation's initial publication, making
      // concurrent refreshes replace complete snapshots rather than interleave.
      await tx.insert(ownedAssetSyncs).values({
        ...owner, lastRefreshedAt: new Date(), pageEtags: etags,
      }).onConflictDoUpdate({
        target: [ownedAssetSyncs.ownerType, ownedAssetSyncs.ownerId],
        set: { pageEtags: etags },
      });
      await saveHoldingNodes(corporationId, index, new Date(), tx);
      await saveOwnedAssets(owner, rows, etags, snapshotId, tx);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return 'superseded';
  }
  invalidateHoldingNodes(corporationId);
  revalidateTag(ownedAssetsTag(owner), 'max');
  return 'saved';
}

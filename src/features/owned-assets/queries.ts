import { and, eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { isUniqueViolation } from '@/db/pg-errors';
import { type AssetMapInput, buildOwnedAssetMap, type OwnedAssetMap } from './asset-map';
import type { OwnedAsset } from './esi-projection';
import type { OwnerKey, PagedOwnerSyncState } from '@/platform/owner-sync';
import { ownedAssets, ownedAssetSyncs } from './schema';

function ownedAssetsTag(owner: OwnerKey): string {
  return `owned-assets:${owner.ownerType}:${owner.ownerId}`;
}

async function getOwnerAssetRows(owner: OwnerKey): Promise<AssetMapInput[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(ownedAssetsTag(owner));

  const rows = await db
    .select({
      typeId: ownedAssets.typeId,
      quantity: ownedAssets.quantity,
      locationId: ownedAssets.locationId,
      locationFlag: ownedAssets.locationFlag,
      locationType: ownedAssets.locationType,
    })
    .from(ownedAssets)
    .where(and(eq(ownedAssets.ownerType, owner.ownerType), eq(ownedAssets.ownerId, owner.ownerId)));
  return rows.map((row) => ({ ...row, ownerType: owner.ownerType, ownerId: owner.ownerId }));
}

export async function getOwnedAssetMap(owners: OwnerKey[], typeIds: number[]): Promise<OwnedAssetMap> {
  const perOwner = await Promise.all(owners.map(getOwnerAssetRows));
  return buildOwnedAssetMap(perOwner.flat(), typeIds);
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
): Promise<'saved' | 'superseded'> {
  const now = new Date();
  await db
    .delete(ownedAssets)
    .where(and(eq(ownedAssets.ownerType, owner.ownerType), eq(ownedAssets.ownerId, owner.ownerId)));
  if (rows.length > 0) {
    try {
      await db.insert(ownedAssets).values(
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
      if (!isUniqueViolation(error)) throw error;
      return 'superseded';
    }
  }
  await db
    .insert(ownedAssetSyncs)
    .values({ ownerType: owner.ownerType, ownerId: owner.ownerId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({
      target: [ownedAssetSyncs.ownerType, ownedAssetSyncs.ownerId],
      set: { lastRefreshedAt: now, pageEtags: etags },
    });
  revalidateTag(ownedAssetsTag(owner), 'max');
  return 'saved';
}

export async function stampOwnerFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedAssetSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(and(eq(ownedAssetSyncs.ownerType, owner.ownerType), eq(ownedAssetSyncs.ownerId, owner.ownerId)));
}

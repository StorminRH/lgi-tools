// Neon read/write for owned assets (3.7.7.2). The cached per-owner read is the
// consumer surface (the planner's asset ledger); the write-behind half (replace-all
// + freshness stamp) and the live sync-state read serve the on-view refresh.
// Validation lives upstream (the ESI projection + the route layer); these accept
// already-typed values. DB-bound accessor — covered via integration + the consuming
// refresh, per the queries.ts policy. A direct mirror of the owned-blueprints
// queries, minus the best-copy reduce (assets aggregate-at-write).
import { and, eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { type AssetMapInput, buildOwnedAssetMap, type OwnedAssetMap } from './asset-map';
import type { OwnedAsset } from './esi-projection';
import type { OwnerKey, PagedOwnerSyncState } from '@/lib/owner-sync';
import { ownedAssets, ownedAssetSyncs } from './schema';

/** One cache tag per owner so a refresh busts exactly that owner's cached read. */
export function ownedAssetsTag(owner: OwnerKey): string {
  return `owned-assets:${owner.ownerType}:${owner.ownerId}`;
}

// Cached per-owner rows — the FULL per-owner set (no type filter at the DB; the
// reduce applies the build's requested-type scope). One cache entry + tag per
// owner is the high-hit-rate key (a type-id-keyed cache fragments to ~0 hits);
// cacheLife('hours') gives sub-window freshness and the write-behind's
// revalidateTag busts it the moment a refresh persists new rows.
async function getOwnerAssetRows(owner: OwnerKey): Promise<AssetMapInput[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(ownedAssetsTag(owner));
  // location varies per row, so it is selected; owner is constant for this owner's
  // read, so it is injected rather than re-selected on every row.
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

/**
 * The combined owned-asset map across the given owners (the user's characters +
 * member corps, resolved by the caller — owner resolution needs auth, which a
 * feature slice may not import, so the caller passes the owner set in), scoped to
 * the requested type ids. Composes the cached per-owner reads and reduces to the
 * per-type summary (summed owned qty + held-by list).
 */
export async function getOwnedAssetMap(owners: OwnerKey[], typeIds: number[]): Promise<OwnedAssetMap> {
  const perOwner = await Promise.all(owners.map(getOwnerAssetRows));
  return buildOwnedAssetMap(perOwner.flat(), typeIds);
}

/**
 * Live (uncached) sync state for the staleness gate + etag replay. Uncached on
 * purpose: the refresh needs the true last-refreshed time, not a cached view.
 */
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

/**
 * Replace-all write-behind. Sequential (no transaction — the request path runs on
 * the neon-http driver, which has none): delete the owner's rows, insert the fresh
 * set, then stamp the sync row LAST. Stamping last means a partial failure leaves
 * the owner stale, so the next view simply refetches (self-healing).
 */
export async function saveOwnedAssets(
  owner: OwnerKey,
  rows: OwnedAsset[],
  etags: string[],
  snapshotId: number | null = null,
): Promise<void> {
  const now = new Date();
  await db
    .delete(ownedAssets)
    .where(and(eq(ownedAssets.ownerType, owner.ownerType), eq(ownedAssets.ownerId, owner.ownerId)));
  if (rows.length > 0) {
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
  }
  await db
    .insert(ownedAssetSyncs)
    .values({ ownerType: owner.ownerType, ownerId: owner.ownerId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({
      target: [ownedAssetSyncs.ownerType, ownedAssetSyncs.ownerId],
      set: { lastRefreshedAt: now, pageEtags: etags },
    });
  revalidateTag(ownedAssetsTag(owner), 'max');
}

/**
 * The 304 path: bump freshness only, leaving stored rows + held etags untouched
 * (the data is unchanged, so no revalidate). The sync row always exists here — a
 * 304 can only follow a prior fresh save that stored the replayed etag.
 */
export async function stampOwnerFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedAssetSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(and(eq(ownedAssetSyncs.ownerType, owner.ownerType), eq(ownedAssetSyncs.ownerId, owner.ownerId)));
}

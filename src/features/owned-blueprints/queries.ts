// Neon read/write for owned blueprints (MIGRATE.0). The cached per-owner read is
// the consumer surface (3.7.5.2); the write-behind half (replace-all + freshness
// stamp) and the live sync-state read serve the on-view refresh. Validation lives
// upstream (the ESI projection + the route layer); these accept already-typed
// values. DB-bound accessor — covered via integration + the consuming refresh,
// per the queries.ts policy.
import { and, eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { type BlueprintMapInput, type OwnedBlueprintMap, toOwnedBlueprintMap } from './blueprint-map';
import type { OwnedBlueprint } from './esi-projection';
import type { OwnerKey, PagedOwnerSyncState } from '@/lib/owner-sync';
import { ownedBlueprints, ownedBlueprintSyncs } from './schema';

/** One cache tag per owner so a refresh busts exactly that owner's cached read. */
export function ownedBlueprintsTag(owner: OwnerKey): string {
  return `owned-blueprints:${owner.ownerType}:${owner.ownerId}`;
}

// Cached per-owner rows — the granular consumer read. One cache entry + tag per
// owner; cacheLife('hours') gives sub-window freshness and the write-behind's
// revalidateTag busts it the moment a refresh persists new rows.
async function getOwnerBlueprintRows(owner: OwnerKey): Promise<BlueprintMapInput[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(ownedBlueprintsTag(owner));
  // location varies per row, so it is selected; owner is constant for this owner's
  // read, so it is injected rather than re-selected on every row.
  const rows = await db
    .select({
      typeId: ownedBlueprints.typeId,
      materialEfficiency: ownedBlueprints.materialEfficiency,
      timeEfficiency: ownedBlueprints.timeEfficiency,
      runs: ownedBlueprints.runs,
      locationId: ownedBlueprints.locationId,
      locationFlag: ownedBlueprints.locationFlag,
    })
    .from(ownedBlueprints)
    .where(and(eq(ownedBlueprints.ownerType, owner.ownerType), eq(ownedBlueprints.ownerId, owner.ownerId)));
  return rows.map((row) => ({ ...row, ownerType: owner.ownerType, ownerId: owner.ownerId }));
}

/**
 * The combined owned-BP map across the given owners (the user's characters +
 * director corps, resolved by the caller — owner resolution needs auth, which a
 * feature slice may not import, so the caller passes the owner set in). Composes
 * the cached per-owner reads and reduces to the best-copy-per-type map.
 */
export async function getOwnedBlueprintMap(owners: OwnerKey[]): Promise<OwnedBlueprintMap> {
  const perOwner = await Promise.all(owners.map(getOwnerBlueprintRows));
  return toOwnedBlueprintMap(perOwner.flat());
}

/**
 * Live (uncached) sync state for the staleness gate + etag replay. Uncached on
 * purpose: the refresh needs the true last-refreshed time, not a cached view.
 */
export async function readOwnerSyncState(owner: OwnerKey): Promise<PagedOwnerSyncState | null> {
  const rows = await db
    .select({
      lastRefreshedAt: ownedBlueprintSyncs.lastRefreshedAt,
      pageEtags: ownedBlueprintSyncs.pageEtags,
    })
    .from(ownedBlueprintSyncs)
    .where(and(eq(ownedBlueprintSyncs.ownerType, owner.ownerType), eq(ownedBlueprintSyncs.ownerId, owner.ownerId)))
    .limit(1);
  const row = rows[0];
  return row ? { lastRefreshedAt: row.lastRefreshedAt, pageEtags: row.pageEtags } : null;
}

/**
 * Replace-all write-behind. Sequential (no transaction — the request path runs on
 * the neon-http driver, which has none): delete the owner's rows, insert the
 * fresh set, then stamp the sync row LAST. Stamping last means a partial failure
 * leaves the owner stale, so the next view simply refetches (self-healing).
 */
export async function saveOwnedBlueprints(
  owner: OwnerKey,
  rows: OwnedBlueprint[],
  etags: string[],
): Promise<void> {
  const now = new Date();
  await db
    .delete(ownedBlueprints)
    .where(and(eq(ownedBlueprints.ownerType, owner.ownerType), eq(ownedBlueprints.ownerId, owner.ownerId)));
  if (rows.length > 0) {
    await db.insert(ownedBlueprints).values(
      rows.map((r) => ({
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        typeId: r.type_id,
        materialEfficiency: r.material_efficiency,
        timeEfficiency: r.time_efficiency,
        runs: r.runs,
        quantity: r.quantity,
        locationId: r.location_id,
        locationFlag: r.location_flag,
      })),
    );
  }
  await db
    .insert(ownedBlueprintSyncs)
    .values({ ownerType: owner.ownerType, ownerId: owner.ownerId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({
      target: [ownedBlueprintSyncs.ownerType, ownedBlueprintSyncs.ownerId],
      set: { lastRefreshedAt: now, pageEtags: etags },
    });
  revalidateTag(ownedBlueprintsTag(owner), 'max');
}

/**
 * The 304 path: bump freshness only, leaving stored rows + held etags untouched
 * (the data is unchanged, so no revalidate). The sync row always exists here — a
 * 304 can only follow a prior fresh save that stored the replayed etag.
 */
export async function stampOwnerFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedBlueprintSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(and(eq(ownedBlueprintSyncs.ownerType, owner.ownerType), eq(ownedBlueprintSyncs.ownerId, owner.ownerId)));
}

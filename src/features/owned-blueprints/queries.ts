import { and, eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { type BlueprintMapInput, type OwnedBlueprintMap, toOwnedBlueprintMap } from './blueprint-map';
import type { OwnedBlueprint } from './esi-projection';
import type { OwnerKey, PagedOwnerSyncState } from '@/platform/owner-sync';
import { ownedBlueprints, ownedBlueprintSyncs } from './schema';

function ownedBlueprintsTag(owner: OwnerKey): string {
  return `owned-blueprints:${owner.ownerType}:${owner.ownerId}`;
}

async function getOwnerBlueprintRows(owner: OwnerKey): Promise<BlueprintMapInput[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(ownedBlueprintsTag(owner));
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

export async function getOwnedBlueprintMap(owners: OwnerKey[]): Promise<OwnedBlueprintMap> {
  const perOwner = await Promise.all(owners.map(getOwnerBlueprintRows));
  return toOwnedBlueprintMap(perOwner.flat());
}

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

export async function stampOwnerFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedBlueprintSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(and(eq(ownedBlueprintSyncs.ownerType, owner.ownerType), eq(ownedBlueprintSyncs.ownerId, owner.ownerId)));
}

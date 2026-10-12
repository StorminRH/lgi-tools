import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { insertInBatches, replaceOwnerSnapshot } from '@/db/snapshot-replace';
import type { CorpAssetEvidence } from '@/data/corp-holdings/placement';
import { datasetTag, storedExpiry, untilExpires } from '@/data/esi-store';
import { ownerKeyWhere } from '@/lib/db-columns';
import type { PostgresJsDb } from '@/lib/db-types';
import type { CorpGrant, OwnedReadScope } from '@/platform/auth/corp-visibility';
import {
  type BlueprintMapInput,
  type BlueprintRow,
  characterBlueprintInputs,
  type OwnedBlueprintMap,
  toOwnedBlueprintMap,
  visibleCorpBlueprintInputs,
} from './blueprint-map';
import type { OwnedBlueprint } from './esi-projection';
import { ownedBlueprintsKey } from './keys';
import type { OwnerKey, PagedOwnerSyncState } from '@/platform/owner-sync';
import { ownedBlueprints, ownedBlueprintSyncs } from './schema';

/** One owner's blueprint rows, cached across instances until the stored paged answer behind them expires. */
async function getOwnerBlueprintRows(owner: OwnerKey): Promise<BlueprintRow[]> {
  'use cache: remote';
  const key = ownedBlueprintsKey(owner);
  cacheTag(datasetTag(key));
  const [rows, expiresAt] = await Promise.all([
    db
      .select({
        itemId: ownedBlueprints.itemId,
        typeId: ownedBlueprints.typeId,
        materialEfficiency: ownedBlueprints.materialEfficiency,
        timeEfficiency: ownedBlueprints.timeEfficiency,
        runs: ownedBlueprints.runs,
        locationId: ownedBlueprints.locationId,
        locationFlag: ownedBlueprints.locationFlag,
      })
      .from(ownedBlueprints)
      .where(ownerKeyWhere(ownedBlueprints, owner)),
    storedExpiry([key]),
  ]);
  cacheLife(untilExpires(expiresAt));
  return rows;
}

async function characterInputs(characterId: number): Promise<BlueprintMapInput[]> {
  return characterBlueprintInputs(
    await getOwnerBlueprintRows({ ownerType: 'character', ownerId: characterId }),
    characterId,
  );
}

async function corpInputs(grant: CorpGrant, evidence: CorpAssetEvidence | null): Promise<BlueprintMapInput[]> {
  return visibleCorpBlueprintInputs(
    await getOwnerBlueprintRows({ ownerType: 'corporation', ownerId: grant.corporationId }),
    grant,
    evidence,
  );
}

export async function getOwnedBlueprintMap(
  scope: OwnedReadScope,
  evidenceByCorp: ReadonlyMap<number, CorpAssetEvidence | null>,
): Promise<OwnedBlueprintMap> {
  const [characters, corps] = await Promise.all([
    Promise.all(scope.characterIds.map(characterInputs)),
    Promise.all(scope.corps.map((grant) => corpInputs(grant, evidenceByCorp.get(grant.corporationId) ?? null))),
  ]);
  return toOwnedBlueprintMap([...characters.flat(), ...corps.flat()]);
}

export async function readBlueprintSyncState(owner: OwnerKey): Promise<PagedOwnerSyncState | null> {
  const rows = await db
    .select({ lastRefreshedAt: ownedBlueprintSyncs.lastRefreshedAt })
    .from(ownedBlueprintSyncs)
    .where(ownerKeyWhere(ownedBlueprintSyncs, owner))
    .limit(1);
  return rows[0] ?? null;
}

/** Replace an owner's blueprints under its sync-row lock; the sync's commit clears the cache tag afterwards. */
export async function saveOwnedBlueprints(
  owner: OwnerKey,
  rows: OwnedBlueprint[],
  etags: string[],
  options: { database?: PostgresJsDb } = {},
): Promise<void> {
  const now = new Date();
  await replaceOwnerSnapshot({
    lock: (tx) => tx
      .insert(ownedBlueprintSyncs)
      .values({ ownerType: owner.ownerType, ownerId: owner.ownerId, lastRefreshedAt: now, pageEtags: etags })
      .onConflictDoUpdate({
        target: [ownedBlueprintSyncs.ownerType, ownedBlueprintSyncs.ownerId],
        set: { lastRefreshedAt: now, pageEtags: etags },
      }),
    replace: async (tx) => {
      await tx.delete(ownedBlueprints).where(ownerKeyWhere(ownedBlueprints, owner));
      await insertInBatches(tx, ownedBlueprints, rows.map((r) => ({
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        itemId: r.item_id,
        typeId: r.type_id,
        materialEfficiency: r.material_efficiency,
        timeEfficiency: r.time_efficiency,
        runs: r.runs,
        quantity: r.quantity,
        locationId: r.location_id,
        locationFlag: r.location_flag,
      })));
    },
  }, options.database);
}

export async function stampBlueprintFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedBlueprintSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(ownerKeyWhere(ownedBlueprintSyncs, owner));
}

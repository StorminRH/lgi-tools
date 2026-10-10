import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { directDatabase } from '@/db/direct-database';
import type { CorpAssetEvidence } from '@/data/corp-holdings/placement';
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
import type { OwnerKey, PagedOwnerSyncState } from '@/platform/owner-sync';
import { ownedBlueprints, ownedBlueprintSyncs } from './schema';

function ownedBlueprintsTag(owner: OwnerKey): string {
  return `owned-blueprints:${owner.ownerType}:${owner.ownerId}`;
}

async function getOwnerBlueprintRows(owner: OwnerKey): Promise<BlueprintRow[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(ownedBlueprintsTag(owner));
  return db
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
    .where(ownerKeyWhere(ownedBlueprints, owner));
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
    .select({
      lastRefreshedAt: ownedBlueprintSyncs.lastRefreshedAt,
      pageEtags: ownedBlueprintSyncs.pageEtags,
    })
    .from(ownedBlueprintSyncs)
    .where(ownerKeyWhere(ownedBlueprintSyncs, owner))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveOwnedBlueprints(
  owner: OwnerKey,
  rows: OwnedBlueprint[],
  etags: string[],
  options: { database?: PostgresJsDb } = {},
): Promise<void> {
  const database = options.database ?? directDatabase();
  const now = new Date();
  await database.transaction(async (tx) => {
    await tx.insert(ownedBlueprintSyncs)
      .values({ ...owner, lastRefreshedAt: now, pageEtags: etags })
      .onConflictDoUpdate({
        target: [ownedBlueprintSyncs.ownerType, ownedBlueprintSyncs.ownerId],
        set: { lastRefreshedAt: now, pageEtags: etags },
      });
    await tx
      .delete(ownedBlueprints)
      .where(ownerKeyWhere(ownedBlueprints, owner));
    if (rows.length > 0) {
      await tx.insert(ownedBlueprints).values(
        rows.map((r) => ({
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
        })),
      );
    }
  });
  revalidateTag(ownedBlueprintsTag(owner), 'max');
}

export async function stampBlueprintFresh(owner: OwnerKey): Promise<void> {
  await db
    .update(ownedBlueprintSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(ownerKeyWhere(ownedBlueprintSyncs, owner));
}

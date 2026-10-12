import { corpAssetsKey } from '@/data/corp-holdings/keys';
import type { EsiStoreKey } from '@/data/esi-store';
import { corporationsOf, type EnumeratedOwner, type OwnerKey } from '@/platform/owner-sync';
import { canSyncCorpAssets } from './corp-sync-eligibility';
import { canSyncAssets } from './sync-eligibility';

/** The stored paged answer behind one owner's asset rows. */
export function ownedAssetsKey(owner: OwnerKey): EsiStoreKey {
  return owner.ownerType === 'character'
    ? { route: '/characters/{character_id}/assets/', holder: { kind: 'character', id: owner.ownerId } }
    : corpAssetsKey(owner.ownerId);
}

/** The stored answers the board's personal-assets refresh would check: the eligible characters' only. */
export function characterAssetsDueKeys(owners: readonly EnumeratedOwner[]): EsiStoreKey[] {
  return owners.filter(canSyncAssets).map((owner) => ownedAssetsKey({ ownerType: 'character', ownerId: owner.characterId }));
}

/** The stored answers a full owned-assets refresh would check: eligible characters, and the corporations of eligible members. */
export function ownedAssetsDueKeys(owners: readonly EnumeratedOwner[]): EsiStoreKey[] {
  const corps = [...corporationsOf(owners, canSyncCorpAssets).keys()];
  return [
    ...characterAssetsDueKeys(owners),
    ...corps.map((corporationId) => ownedAssetsKey({ ownerType: 'corporation', ownerId: corporationId })),
  ];
}

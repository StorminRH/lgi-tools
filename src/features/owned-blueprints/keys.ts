import type { EsiStoreKey } from '@/data/esi-store';
import { corporationsOf, type EnumeratedOwner, type OwnerKey } from '@/platform/owner-sync';
import { canSyncCorpBlueprints } from './corp-sync-eligibility';
import { canSyncBlueprints } from './sync-eligibility';

/** The stored paged answer behind one owner's blueprint rows. */
export function ownedBlueprintsKey(owner: OwnerKey): EsiStoreKey {
  return owner.ownerType === 'character'
    ? { route: '/characters/{character_id}/blueprints/', holder: { kind: 'character', id: owner.ownerId } }
    : { route: '/corporations/{corporation_id}/blueprints/', holder: { kind: 'corporation', id: owner.ownerId } };
}

/** The stored answers an owned-blueprints refresh would check: eligible characters, and the corporations of eligible members. */
export function ownedBlueprintsDueKeys(owners: readonly EnumeratedOwner[]): EsiStoreKey[] {
  const corps = [...corporationsOf(owners, canSyncCorpBlueprints).keys()];
  return [
    ...owners.filter(canSyncBlueprints).map((owner) => ownedBlueprintsKey({ ownerType: 'character', ownerId: owner.characterId })),
    ...corps.map((corporationId) => ownedBlueprintsKey({ ownerType: 'corporation', ownerId: corporationId })),
  ];
}

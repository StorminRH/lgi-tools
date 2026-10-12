import type { EsiStoreKey } from '@/data/esi-store';
import type { OwnerKey } from '@/platform/owner-sync';

/** The stored paged answer behind one owner's blueprint rows. */
export function ownedBlueprintsKey(owner: OwnerKey): EsiStoreKey {
  return owner.ownerType === 'character'
    ? { route: '/characters/{character_id}/blueprints/', holder: { kind: 'character', id: owner.ownerId } }
    : { route: '/corporations/{corporation_id}/blueprints/', holder: { kind: 'corporation', id: owner.ownerId } };
}

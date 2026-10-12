import { corpAssetsKey } from '@/data/corp-holdings/keys';
import type { EsiStoreKey } from '@/data/esi-store';
import type { OwnerKey } from '@/platform/owner-sync';

/** The stored paged answer behind one owner's asset rows. */
export function ownedAssetsKey(owner: OwnerKey): EsiStoreKey {
  return owner.ownerType === 'character'
    ? { route: '/characters/{character_id}/assets/', holder: { kind: 'character', id: owner.ownerId } }
    : corpAssetsKey(owner.ownerId);
}

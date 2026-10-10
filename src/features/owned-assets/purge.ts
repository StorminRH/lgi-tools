import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import type { PurgeContributor } from '@/platform/purge/types';
import { ownedAssets, ownedAssetSyncs } from './schema';

export const ownedAssetsPurgeContributor: PurgeContributor = {
  name: 'owned-assets',
  tier: 'cache',
  claims: [ownedAssets, ownedAssetSyncs],
  merge: [
    { table: ownedAssets, rule: 'follows-character' },
    { table: ownedAssetSyncs, rule: 'follows-character' },
  ],
  async purgeCharacter({ characterId }) {
    const owner = { ownerType: 'character', ownerId: characterId } as const;
    await db.delete(ownedAssets).where(ownerKeyWhere(ownedAssets, owner));
    await db.delete(ownedAssetSyncs).where(ownerKeyWhere(ownedAssetSyncs, owner));
  },
};

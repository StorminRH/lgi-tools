import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { ownedAssetsTag } from './queries';
import { ownedAssets, ownedAssetSyncs } from './schema';

export const ownedAssetsPurgeContributor = characterCacheContributor(db, {
  name: 'owned-assets',
  tables: [
    {
      table: ownedAssets,
      where: (ownerId) => ownerKeyWhere(ownedAssets, { ownerType: 'character', ownerId }),
    },
    {
      table: ownedAssetSyncs,
      where: (ownerId) => ownerKeyWhere(ownedAssetSyncs, { ownerType: 'character', ownerId }),
    },
  ],
  cacheTags: (ownerId) => [ownedAssetsTag({ ownerType: 'character', ownerId })],
});

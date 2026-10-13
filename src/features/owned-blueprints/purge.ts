import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { eveTag } from '@/lib/esi-datasets/routes';
import { ownedBlueprints, ownedBlueprintSyncs } from './schema';

export const ownedBlueprintsPurgeContributor = characterCacheContributor(db, {
  name: 'owned-blueprints',
  tables: [
    {
      table: ownedBlueprints,
      where: (ownerId) => ownerKeyWhere(ownedBlueprints, { ownerType: 'character', ownerId }),
    },
    {
      table: ownedBlueprintSyncs,
      where: (ownerId) => ownerKeyWhere(ownedBlueprintSyncs, { ownerType: 'character', ownerId }),
    },
  ],
  cacheTags: (ownerId) => [eveTag('owned_blueprints', { kind: 'character', id: ownerId })],
});

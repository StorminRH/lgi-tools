import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { esiSnapshots } from './schema';

export const esiSnapshotsPurgeContributor = characterCacheContributor(db, {
  name: 'esi-snapshots',
  tables: [
    {
      table: esiSnapshots,
      where: (ownerId) => ownerKeyWhere(esiSnapshots, { ownerType: 'character', ownerId }),
    },
  ],
});

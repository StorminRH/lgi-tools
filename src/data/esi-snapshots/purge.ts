import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import type { PurgeContributor } from '@/platform/purge/types';
import { esiSnapshots } from './schema';

export const esiSnapshotsPurgeContributor: PurgeContributor = {
  name: 'esi-snapshots',
  tier: 'cache',
  claims: [esiSnapshots],
  merge: [{ table: esiSnapshots, rule: 'follows-character' }],
  async purgeCharacter({ characterId }) {
    await db
      .delete(esiSnapshots)
      .where(ownerKeyWhere(esiSnapshots, { ownerType: 'character', ownerId: characterId }));
  },
};

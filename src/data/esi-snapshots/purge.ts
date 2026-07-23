import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { esiSnapshots } from './schema';

/**
 * Personal-data purge contributor for esi snapshots purge contributor; this data slice owns
 * deleting its user and character keyed rows.
 */
export const esiSnapshotsPurgeContributor: PurgeContributor = {
  name: 'esi-snapshots',
  tier: 'cache',
  claims: [esiSnapshots],
  async purgeCharacter({ characterId }) {
    await db
      .delete(esiSnapshots)
      .where(and(eq(esiSnapshots.ownerType, 'character'), eq(esiSnapshots.ownerId, characterId)));
  },
};

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import { esiSnapshots } from './schema';

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

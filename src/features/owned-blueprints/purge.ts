import { db } from '@/db';
import { ownerKeyWhere } from '@/lib/db-columns';
import type { PurgeContributor } from '@/platform/purge/types';
import { ownedBlueprints, ownedBlueprintSyncs } from './schema';

export const ownedBlueprintsPurgeContributor: PurgeContributor = {
  name: 'owned-blueprints',
  tier: 'cache',
  claims: [ownedBlueprints, ownedBlueprintSyncs],
  merge: [
    { table: ownedBlueprints, rule: 'follows-character' },
    { table: ownedBlueprintSyncs, rule: 'follows-character' },
  ],
  async purgeCharacter({ characterId }) {
    const owner = { ownerType: 'character', ownerId: characterId } as const;
    await db.delete(ownedBlueprints).where(ownerKeyWhere(ownedBlueprints, owner));
    await db.delete(ownedBlueprintSyncs).where(ownerKeyWhere(ownedBlueprintSyncs, owner));
  },
};

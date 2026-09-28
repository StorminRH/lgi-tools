import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { corpMemberBases } from './schema';

/** Corp-owned ESI data: a Director's next context pass re-adds the row while the character stays in the corp. */
export const corpHoldingsPurgeContributor: PurgeContributor = {
  name: 'corp-holdings',
  tier: 'cache',
  claims: [corpMemberBases],
  merge: [{ table: corpMemberBases, rule: 'follows-character' }],
  async purgeCharacter({ characterId }) {
    await db.delete(corpMemberBases).where(eq(corpMemberBases.characterId, characterId));
  },
};

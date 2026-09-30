import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { corpMemberRoles } from '@/db/auth-schema';
import type { PurgeContributor } from '@/platform/purge/types';

export const corpRolesPurgeContributor: PurgeContributor = {
  name: 'corp-roles',
  tier: 'cache',
  claims: [corpMemberRoles],
  merge: [{ table: corpMemberRoles, rule: 'follows-character' }],
  async purgeCharacter({ characterId }) {
    await db.delete(corpMemberRoles).where(eq(corpMemberRoles.characterId, characterId));
  },
};

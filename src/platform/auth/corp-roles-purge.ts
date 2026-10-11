import { db } from '@/db';
import { corpMemberRoles } from '@/db/auth-schema';
import { characterCacheContributor } from '@/platform/purge/contributors';

export const corpRolesPurgeContributor = characterCacheContributor(db, {
  name: 'corp-roles',
  tables: [{ table: corpMemberRoles, characterId: corpMemberRoles.characterId }],
});

import { db } from '@/db';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { corpMemberBases } from './schema';

export const corpHoldingsPurgeContributor = characterCacheContributor(db, {
  name: 'corp-holdings',
  tables: [{ table: corpMemberBases, characterId: corpMemberBases.characterId }],
  // corp_member_bases is never read under 'use cache': the cached holdings
  // reader serves corporation-keyed nodes and profiles, so nothing expires.
  cacheTags: () => [],
});

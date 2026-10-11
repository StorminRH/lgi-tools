import { db } from '@/db';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { corpMemberBases } from './schema';

export const corpHoldingsPurgeContributor = characterCacheContributor(db, {
  name: 'corp-holdings',
  tables: [{ table: corpMemberBases, characterId: corpMemberBases.characterId }],
});

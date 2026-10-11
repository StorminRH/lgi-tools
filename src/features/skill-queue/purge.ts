import { db } from '@/db';
import { characterCacheContributor } from '@/platform/purge/contributors';
import { characterSkills, characterSkillSyncs } from './schema';

export const skillQueuePurgeContributor = characterCacheContributor(db, {
  name: 'skill-queue',
  tables: [
    { table: characterSkills, characterId: characterSkills.characterId },
    { table: characterSkillSyncs, characterId: characterSkillSyncs.characterId },
  ],
});

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { characterSkills, characterSkillSyncs } from './schema';

export const skillQueuePurgeContributor: PurgeContributor = {
  name: 'skill-queue',
  tier: 'cache',
  claims: [characterSkills, characterSkillSyncs],
  async purgeCharacter({ characterId }) {
    await db.delete(characterSkills).where(eq(characterSkills.characterId, characterId));
    await db.delete(characterSkillSyncs).where(eq(characterSkillSyncs.characterId, characterId));
  },
};

// Skill-queue purge contributor (ACCOUNT.1) — cache tier. The skills data + sync
// rows are a regenerable ESI mirror keyed by character, torn down with the character.
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import { characterSkills, characterSkillSyncs } from './schema';

/**
 * Personal-data purge contributor for skill queue purge contributor; this data slice owns deleting
 * its user and character keyed rows.
 */
export const skillQueuePurgeContributor: PurgeContributor = {
  name: 'skill-queue',
  tier: 'cache',
  claims: [characterSkills, characterSkillSyncs],
  async purgeCharacter({ characterId }) {
    await db.delete(characterSkills).where(eq(characterSkills.characterId, characterId));
    await db.delete(characterSkillSyncs).where(eq(characterSkillSyncs.characterId, characterId));
  },
};

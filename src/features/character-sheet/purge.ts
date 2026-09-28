import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { characterSheets } from './schema';

export const characterSheetPurgeContributor: PurgeContributor = {
  name: 'character-sheet',
  tier: 'cache',
  claims: [characterSheets],
  merge: [{ table: characterSheets, rule: 'follows-character' }],
  async purgeCharacter({ characterId }) {
    await db.delete(characterSheets).where(eq(characterSheets.characterId, characterId));
  },
};

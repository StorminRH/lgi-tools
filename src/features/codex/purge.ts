import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { codexRevisions } from './schema';

export const codexPurgeContributor: PurgeContributor = {
  name: 'codex',
  tier: 'durable',
  claims: [codexRevisions],
  merge: [{ table: codexRevisions, rule: 'rekey' }],
  async purgeCharacter({ characterId }) {
    await db
      .update(codexRevisions)
      .set({ characterId: null })
      .where(eq(codexRevisions.characterId, characterId));
  },
  async purgeUser({ userId }) {
    await db
      .update(codexRevisions)
      .set({ userId: null, characterId: null })
      .where(eq(codexRevisions.userId, userId));
  },
};

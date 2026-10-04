import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { codexCacheTags } from './queries';
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
    revalidateTag(codexCacheTags.index, { expire: 0 });
  },
  async purgeUser({ userId }) {
    await db
      .update(codexRevisions)
      .set({ userId: null, characterId: null })
      .where(eq(codexRevisions.userId, userId));
    revalidateTag(codexCacheTags.index, { expire: 0 });
  },
};

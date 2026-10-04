import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { codexCacheTags } from './queries';
import { codexProposals, codexRevisions } from './schema';

export const codexPurgeContributor: PurgeContributor = {
  name: 'codex',
  tier: 'durable',
  claims: [codexRevisions, codexProposals],
  merge: [
    { table: codexRevisions, rule: 'rekey' },
    { table: codexProposals, rule: 'rekey' },
  ],
  async purgeCharacter({ characterId }) {
    await db.delete(codexProposals).where(eq(codexProposals.characterId, characterId));
    await db
      .update(codexRevisions)
      .set({ characterId: null })
      .where(eq(codexRevisions.characterId, characterId));
    revalidateTag(codexCacheTags.index, { expire: 0 });
    revalidateTag(codexCacheTags.credits, { expire: 0 });
  },
  async purgeUser({ userId }) {
    await db.delete(codexProposals).where(eq(codexProposals.userId, userId));
    await db
      .update(codexRevisions)
      .set({ userId: null, characterId: null })
      .where(eq(codexRevisions.userId, userId));
    revalidateTag(codexCacheTags.index, { expire: 0 });
    revalidateTag(codexCacheTags.credits, { expire: 0 });
  },
};

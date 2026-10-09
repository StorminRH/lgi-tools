import { eq, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db } from '@/db';
import type { MergeSubject, MergeTx, PurgeContributor } from '@/platform/purge/types';
import { codexCacheTags } from './queries';
import { codexAssets, codexProposals, codexRevisions } from './schema';

async function repointPendingProposals(
  tx: MergeTx,
  { sourceUserId, survivorUserId }: MergeSubject,
): Promise<readonly string[]> {
  const result = await tx.execute(sql`
    SELECT s.id::text AS retired, v.id::text AS kept
    FROM ${codexAssets} AS s JOIN ${codexAssets} AS v ON v.sha256 = s.sha256
    WHERE s.user_id = ${sourceUserId} AND s.status = 'pending' AND v.user_id = ${survivorUserId} AND v.status <> 'removed'
    UNION ALL
    SELECT v.id::text, s.id::text
    FROM ${codexAssets} AS v JOIN ${codexAssets} AS s ON s.sha256 = v.sha256
    WHERE v.user_id = ${survivorUserId} AND v.status = 'pending' AND s.user_id = ${sourceUserId} AND s.status = 'published'
  `);
  const pairs = (Array.isArray(result) ? result : result.rows) as { retired: string; kept: string }[];
  for (const { retired, kept } of pairs) {
    await tx.execute(sql`
      UPDATE ${codexProposals} SET doc = replace(doc::text, ${`"${retired}"`}, ${`"${kept}"`})::jsonb
      WHERE status = 'pending' AND doc::text LIKE ${`%"${retired}"%`}
    `);
  }
  return pairs.map(({ retired }) => retired);
}

async function mergeAssets(tx: MergeTx, subject: MergeSubject): Promise<void> {
  const { sourceUserId, survivorUserId } = subject;
  const retired = await repointPendingProposals(tx, subject);
  if (retired.length > 0) {
    await tx.execute(sql`UPDATE ${codexAssets} SET status = 'removed' WHERE id = ANY(${`{${retired.join(',')}}`}::uuid[])`);
  }
  await tx.execute(sql`
    UPDATE ${codexAssets} AS s
    SET user_id = CASE WHEN s.status <> 'removed' AND EXISTS (SELECT 1 FROM ${codexAssets} AS v
      WHERE v.user_id = ${survivorUserId} AND v.sha256 = s.sha256 AND v.status <> 'removed')
      THEN NULL ELSE ${survivorUserId} END
    WHERE s.user_id = ${sourceUserId}
  `);
}

export const codexPurgeContributor: PurgeContributor = {
  name: 'codex',
  tier: 'durable',
  claims: [codexRevisions, codexProposals, codexAssets],
  merge: [
    { table: codexRevisions, rule: 'rekey' },
    { table: codexProposals, rule: 'rekey' },
    {
      tables: [codexAssets],
      rule: 'custom',
      reason:
        'Screenshots move to the survivor; where both accounts hold the same image, the pending copy retires and two published copies keep the survivor as uploader.',
      merge: mergeAssets,
    },
  ],
  async purgeCharacter({ characterId }) {
    await db.delete(codexProposals).where(eq(codexProposals.characterId, characterId));
    await db
      .update(codexRevisions)
      .set({ characterId: null })
      .where(eq(codexRevisions.characterId, characterId));
    await db.update(codexAssets).set({ characterId: null }).where(eq(codexAssets.characterId, characterId));
    revalidateTag(codexCacheTags.index, { expire: 0 });
    revalidateTag(codexCacheTags.credits, { expire: 0 });
  },
  async purgeUser({ userId }) {
    await db.delete(codexProposals).where(eq(codexProposals.userId, userId));
    await db
      .update(codexRevisions)
      .set({ userId: null, characterId: null })
      .where(eq(codexRevisions.userId, userId));
    await db
      .update(codexAssets)
      .set({
        status: sql`CASE WHEN ${codexAssets.status} = 'pending' THEN 'removed' ELSE ${codexAssets.status} END`,
        userId: null,
        characterId: null,
      })
      .where(eq(codexAssets.userId, userId));
    revalidateTag(codexCacheTags.index, { expire: 0 });
    revalidateTag(codexCacheTags.credits, { expire: 0 });
  },
};

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import type { MergeSubject, MergeTx, PurgeContributor } from '@/platform/purge/types';
import {
  characterIndustryJobs,
  characterIndustryJobSyncs,
  corpIndustryJobs,
  corpIndustryJobSyncs,
} from './schema';

async function mergeCorpJobsPaired(tx: MergeTx, subject: MergeSubject): Promise<void> {
  const pair = [corpIndustryJobs, corpIndustryJobSyncs] as const;
  const survivorRows = await Promise.all(
    pair.map((table) =>
      tx
        .select({ corporationId: table.corporationId })
        .from(table)
        .where(eq(table.userId, subject.survivorUserId)),
    ),
  );
  const kept = survivorRows.flat().map((row) => row.corporationId);
  for (const table of pair) {
    await tx
      .delete(table)
      .where(and(eq(table.userId, subject.sourceUserId), inArray(table.corporationId, kept)));
    await tx
      .update(table)
      .set({ userId: subject.survivorUserId })
      .where(eq(table.userId, subject.sourceUserId));
  }
}

export const industryJobsPurgeContributor: PurgeContributor = {
  name: 'industry-jobs',
  tier: 'cache',
  claims: [
    characterIndustryJobs,
    characterIndustryJobSyncs,
    corpIndustryJobs,
    corpIndustryJobSyncs,
  ],
  merge: [
    { table: characterIndustryJobs, rule: 'follows-character' },
    { table: characterIndustryJobSyncs, rule: 'follows-character' },
    {
      tables: [corpIndustryJobs, corpIndustryJobSyncs],
      rule: 'custom',
      reason: 'jobs and syncs are one snapshot per (user, corporation) and must move or drop as a pair',
      merge: mergeCorpJobsPaired,
    },
  ],
  async purgeCharacter({ characterId }) {
    await db
      .delete(characterIndustryJobs)
      .where(eq(characterIndustryJobs.characterId, characterId));
    await db
      .delete(characterIndustryJobSyncs)
      .where(eq(characterIndustryJobSyncs.characterId, characterId));
  },
  async purgeUser({ userId }) {
    await db.delete(corpIndustryJobs).where(eq(corpIndustryJobs.userId, userId));
    await db.delete(corpIndustryJobSyncs).where(eq(corpIndustryJobSyncs.userId, userId));
  },
};

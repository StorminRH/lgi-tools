import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import type { MergeSubject, MergeTx, PurgeContributor } from '@/platform/purge/types';
import {
  characterIndustryJobs,
  characterIndustryJobSyncs,
  corpIndustryJobs,
  corpIndustryJobSyncs,
} from './schema';

/**
 * Jobs and syncs are one snapshot per (user, corporation). A corporation the
 * survivor already has in EITHER table keeps the survivor's pair, so a merge
 * never splits a snapshot from its sync state. Both deletes run before either
 * move: a moved jobs row must not make the survivor "own" the corporation
 * when the syncs row is judged.
 */
export async function mergeCorpJobsPaired(tx: MergeTx, subject: MergeSubject): Promise<void> {
  const kept = sql`
    SELECT ${corpIndustryJobs.corporationId} FROM ${corpIndustryJobs}
    WHERE ${corpIndustryJobs.userId} = ${subject.survivorUserId}
    UNION
    SELECT ${corpIndustryJobSyncs.corporationId} FROM ${corpIndustryJobSyncs}
    WHERE ${corpIndustryJobSyncs.userId} = ${subject.survivorUserId}
  `;
  const pair = [corpIndustryJobs, corpIndustryJobSyncs] as const;
  for (const table of pair) {
    await tx.execute(sql`
      DELETE FROM ${table}
      WHERE ${table.userId} = ${subject.sourceUserId}
        AND ${table.corporationId} IN (${kept})
    `);
  }
  for (const table of pair) {
    await tx.execute(sql`
      UPDATE ${table} SET user_id = ${subject.survivorUserId}
      WHERE ${table.userId} = ${subject.sourceUserId}
    `);
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

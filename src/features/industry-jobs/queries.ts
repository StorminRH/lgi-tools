import { and, eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import type { IndustryJob } from './esi-projection';
import {
  characterIndustryJobs,
  characterIndustryJobSyncs,
  corpIndustryJobs,
  corpIndustryJobSyncs,
} from './schema';
import type { CharacterJobsData, CharacterJobsSyncState, CorpJobsSyncState } from './types';

function industryJobsTag(characterId: number): string {
  return `industry-jobs:${characterId}`;
}

async function getCharacterJobs(characterId: number): Promise<CharacterJobsData | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(industryJobsTag(characterId));
  const rows = await db
    .select({ jobs: characterIndustryJobs.jobs })
    .from(characterIndustryJobs)
    .where(eq(characterIndustryJobs.characterId, characterId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return { jobs: row.jobs };
}

export async function getJobsForCharacters(
  characterIds: number[],
): Promise<Map<number, CharacterJobsData>> {
  return mapByIdDroppingNulls(characterIds, getCharacterJobs);
}

export async function readCharacterJobSyncState(
  characterId: number,
): Promise<CharacterJobsSyncState | null> {
  const rows = await db
    .select({
      lastRefreshedAt: characterIndustryJobSyncs.lastRefreshedAt,
      jobsEtag: characterIndustryJobSyncs.jobsEtag,
    })
    .from(characterIndustryJobSyncs)
    .where(eq(characterIndustryJobSyncs.characterId, characterId))
    .limit(1);
  const row = rows[0];
  return row ? { lastRefreshedAt: row.lastRefreshedAt, jobsEtag: row.jobsEtag } : null;
}

export async function saveCharacterJobs(
  characterId: number,
  jobs: IndustryJob[],
  etag: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(characterIndustryJobs)
    .values({ characterId, jobs })
    .onConflictDoUpdate({ target: characterIndustryJobs.characterId, set: { jobs } });
  await db
    .insert(characterIndustryJobSyncs)
    .values({ characterId, lastRefreshedAt: now, jobsEtag: etag })
    .onConflictDoUpdate({
      target: characterIndustryJobSyncs.characterId,
      set: { lastRefreshedAt: now, jobsEtag: etag },
    });
  revalidateTag(industryJobsTag(characterId), 'max');
}

export async function stampCharacterJobsFresh(characterId: number): Promise<void> {
  await db
    .update(characterIndustryJobSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterIndustryJobSyncs.characterId, characterId));
}

function corpIndustryJobsTag(userId: string, corporationId: number): string {
  return `corp-industry-jobs:${userId}:${corporationId}`;
}

async function getCorpJobs(userId: string, corporationId: number): Promise<CharacterJobsData | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(corpIndustryJobsTag(userId, corporationId));
  const rows = await db
    .select({ jobs: corpIndustryJobs.jobs })
    .from(corpIndustryJobs)
    .where(and(eq(corpIndustryJobs.userId, userId), eq(corpIndustryJobs.corporationId, corporationId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return { jobs: row.jobs };
}

export async function getCorpJobsForUser(
  userId: string,
  corporationIds: number[],
): Promise<Map<number, CharacterJobsData>> {
  return mapByIdDroppingNulls(corporationIds, (id) => getCorpJobs(userId, id));
}

export async function listCorpJobSyncStates(
  userId: string,
): Promise<Array<{ corporationId: number } & CorpJobsSyncState>> {
  const rows = await db
    .select({
      corporationId: corpIndustryJobSyncs.corporationId,
      lastRefreshedAt: corpIndustryJobSyncs.lastRefreshedAt,
      jobsEtag: corpIndustryJobSyncs.jobsEtag,
      syncError: corpIndustryJobSyncs.syncError,
    })
    .from(corpIndustryJobSyncs)
    .where(eq(corpIndustryJobSyncs.userId, userId));
  return rows
    .map((row) => ({
      corporationId: row.corporationId,
      lastRefreshedAt: row.lastRefreshedAt,
      jobsEtag: row.jobsEtag,
      syncError: row.syncError,
    }))
    .sort((a, b) => a.corporationId - b.corporationId);
}

export async function readCorpJobSyncState(
  userId: string,
  corporationId: number,
): Promise<CorpJobsSyncState | null> {
  const rows = await db
    .select({
      lastRefreshedAt: corpIndustryJobSyncs.lastRefreshedAt,
      jobsEtag: corpIndustryJobSyncs.jobsEtag,
      syncError: corpIndustryJobSyncs.syncError,
    })
    .from(corpIndustryJobSyncs)
    .where(
      and(eq(corpIndustryJobSyncs.userId, userId), eq(corpIndustryJobSyncs.corporationId, corporationId)),
    )
    .limit(1);
  const row = rows[0];
  return row
    ? { lastRefreshedAt: row.lastRefreshedAt, jobsEtag: row.jobsEtag, syncError: row.syncError }
    : null;
}

export async function saveCorpJobs(
  userId: string,
  corporationId: number,
  jobs: IndustryJob[],
  etag: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(corpIndustryJobs)
    .values({ userId, corporationId, jobs })
    .onConflictDoUpdate({
      target: [corpIndustryJobs.userId, corpIndustryJobs.corporationId],
      set: { jobs },
    });
  await db
    .insert(corpIndustryJobSyncs)
    .values({ userId, corporationId, lastRefreshedAt: now, jobsEtag: etag, syncError: null })
    .onConflictDoUpdate({
      target: [corpIndustryJobSyncs.userId, corpIndustryJobSyncs.corporationId],
      set: { lastRefreshedAt: now, jobsEtag: etag, syncError: null },
    });
  revalidateTag(corpIndustryJobsTag(userId, corporationId), 'max');
}

export async function saveCorpNeedsRole(userId: string, corporationId: number): Promise<void> {
  const now = new Date();
  await db
    .delete(corpIndustryJobs)
    .where(and(eq(corpIndustryJobs.userId, userId), eq(corpIndustryJobs.corporationId, corporationId)));
  await db
    .insert(corpIndustryJobSyncs)
    .values({ userId, corporationId, lastRefreshedAt: now, jobsEtag: null, syncError: 'needs_role' })
    .onConflictDoUpdate({
      target: [corpIndustryJobSyncs.userId, corpIndustryJobSyncs.corporationId],
      set: { lastRefreshedAt: now, jobsEtag: null, syncError: 'needs_role' },
    });
  revalidateTag(corpIndustryJobsTag(userId, corporationId), 'max');
}

export async function stampCorpJobsFresh(userId: string, corporationId: number): Promise<void> {
  await db
    .update(corpIndustryJobSyncs)
    .set({ lastRefreshedAt: new Date(), syncError: null })
    .where(
      and(eq(corpIndustryJobSyncs.userId, userId), eq(corpIndustryJobSyncs.corporationId, corporationId)),
    );
}

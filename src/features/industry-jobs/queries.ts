import { and, eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { datasetTag, forgetStored, storedExpiry, untilExpires } from '@/data/esi-store';
import { db } from '@/db';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import type { IndustryJob } from './esi-projection';
import { characterJobsKey, corpJobsKey } from './keys';
import {
  characterIndustryJobs,
  characterIndustryJobSyncs,
  corpIndustryJobs,
  corpIndustryJobSyncs,
} from './schema';
import type { CharacterJobsData, CharacterJobsSyncState, CorpJobsSyncState } from './types';

/** One character's jobs feed, cached across instances until its stored answer expires. */
async function getCharacterJobs(characterId: number): Promise<CharacterJobsData | null> {
  'use cache: remote';
  const key = characterJobsKey(characterId);
  cacheTag(datasetTag(key));
  const [jobs, expiresAt] = await Promise.all([readCharacterJobs(characterId), storedExpiry([key])]);
  cacheLife(untilExpires(expiresAt));
  return jobs;
}

export async function readCharacterJobs(characterId: number): Promise<CharacterJobsData | null> {
  const rows = await db
    .select({ jobs: characterIndustryJobs.jobs })
    .from(characterIndustryJobs)
    .where(eq(characterIndustryJobs.characterId, characterId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getJobsForCharacters(
  characterIds: number[],
): Promise<Map<number, CharacterJobsData>> {
  return mapByIdDroppingNulls(characterIds, getCharacterJobs);
}

const characterSyncStateColumns = {
  lastRefreshedAt: characterIndustryJobSyncs.lastRefreshedAt,
};

export async function readCharacterJobSyncState(
  characterId: number,
): Promise<CharacterJobsSyncState | null> {
  const rows = await db
    .select(characterSyncStateColumns)
    .from(characterIndustryJobSyncs)
    .where(eq(characterIndustryJobSyncs.characterId, characterId))
    .limit(1);
  return rows[0] ?? null;
}

/** Uncached, in one query: each listed character's sync state; a character with no row is absent. */
export async function listCharacterJobSyncStates(
  characterIds: number[],
): Promise<Map<number, CharacterJobsSyncState>> {
  if (characterIds.length === 0) return new Map();
  const rows = await db
    .select({ characterId: characterIndustryJobSyncs.characterId, ...characterSyncStateColumns })
    .from(characterIndustryJobSyncs)
    .where(inArray(characterIndustryJobSyncs.characterId, characterIds));
  return new Map(rows.map(({ characterId, ...state }) => [characterId, state]));
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
}

export async function stampCharacterJobsFresh(characterId: number): Promise<void> {
  await db
    .update(characterIndustryJobSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterIndustryJobSyncs.characterId, characterId));
}

/** One user's view of a corporation's jobs: held per user, so it is cached and cleared per user too. */
async function getCorpJobs(userId: string, corporationId: number): Promise<CharacterJobsData | null> {
  'use cache: remote';
  const key = corpJobsKey(userId, corporationId);
  cacheTag(datasetTag(key));
  const [rows, expiresAt] = await Promise.all([
    db
      .select({ jobs: corpIndustryJobs.jobs })
      .from(corpIndustryJobs)
      .where(and(eq(corpIndustryJobs.userId, userId), eq(corpIndustryJobs.corporationId, corporationId)))
      .limit(1),
    storedExpiry([key]),
  ]);
  cacheLife(untilExpires(expiresAt));
  return rows[0] ?? null;
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
  return db
    .select({
      corporationId: corpIndustryJobSyncs.corporationId,
      lastRefreshedAt: corpIndustryJobSyncs.lastRefreshedAt,
      syncError: corpIndustryJobSyncs.syncError,
    })
    .from(corpIndustryJobSyncs)
    .where(eq(corpIndustryJobSyncs.userId, userId))
    .orderBy(corpIndustryJobSyncs.corporationId);
}

export async function readCorpJobSyncState(
  userId: string,
  corporationId: number,
): Promise<CorpJobsSyncState | null> {
  const rows = await db
    .select({
      lastRefreshedAt: corpIndustryJobSyncs.lastRefreshedAt,
      syncError: corpIndustryJobSyncs.syncError,
    })
    .from(corpIndustryJobSyncs)
    .where(
      and(eq(corpIndustryJobSyncs.userId, userId), eq(corpIndustryJobSyncs.corporationId, corporationId)),
    )
    .limit(1);
  return rows[0] ?? null;
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
}

/** Nobody holds the role: the jobs go, and with them the stored answer, so the next read after the role returns is unconditional. */
export async function saveCorpNeedsRole(userId: string, corporationId: number): Promise<void> {
  const now = new Date();
  await db
    .delete(corpIndustryJobs)
    .where(and(eq(corpIndustryJobs.userId, userId), eq(corpIndustryJobs.corporationId, corporationId)));
  await forgetStored([corpJobsKey(userId, corporationId)]);
  await db
    .insert(corpIndustryJobSyncs)
    .values({ userId, corporationId, lastRefreshedAt: now, jobsEtag: null, syncError: 'needs_role' })
    .onConflictDoUpdate({
      target: [corpIndustryJobSyncs.userId, corpIndustryJobSyncs.corporationId],
      set: { lastRefreshedAt: now, jobsEtag: null, syncError: 'needs_role' },
    });
}

export async function stampCorpJobsFresh(userId: string, corporationId: number): Promise<void> {
  await db
    .update(corpIndustryJobSyncs)
    .set({ lastRefreshedAt: new Date(), syncError: null })
    .where(
      and(eq(corpIndustryJobSyncs.userId, userId), eq(corpIndustryJobSyncs.corporationId, corporationId)),
    );
}

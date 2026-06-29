// Neon read/write for the personal industry-jobs tracker (MIGRATE.B.2). The cached
// per-character read is the consumer surface; the write-behind half (replace-upsert +
// freshness stamp) and the live sync-state read serve the on-view refresh. Validation
// lives upstream (the ESI projection + the route layer); these accept already-typed
// values. DB-bound accessor — covered via integration + the consuming refresh, per the
// queries policy.
import { eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import type { IndustryJob } from './esi-projection';
import { characterIndustryJobs, characterIndustryJobSyncs } from './schema';
import type { CharacterJobsData, CharacterJobsSyncState } from './types';

// One cache tag per character so a refresh busts exactly that character's cached read.
export function industryJobsTag(characterId: number): string {
  return `industry-jobs:${characterId}`;
}

// Cached per-character board — the granular consumer read. One cache entry + tag per
// character; cacheLife('minutes') gives sub-window freshness and the write-behind's
// revalidateTag busts it the moment a refresh persists new data. Returns null when the
// character has never synced (no row).
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

// The combined board map across the given characters (the caller passes the user's
// linked character ids — listing them needs auth, which a feature slice may not
// import). Composes the cached per-character reads; a never-synced character is absent.
export async function getJobsForCharacters(
  characterIds: number[],
): Promise<Map<number, CharacterJobsData>> {
  const entries = await Promise.all(
    characterIds.map(async (id) => [id, await getCharacterJobs(id)] as const),
  );
  const map = new Map<number, CharacterJobsData>();
  for (const [id, data] of entries) {
    if (data !== null) map.set(id, data);
  }
  return map;
}

// Live (uncached) sync state for the staleness gate + etag replay (refresh path) and
// the "as of" stamp (read path). Uncached on purpose: both need the true
// last-refreshed time, not a cached view.
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

// The write-behind. One single-page endpoint replaces the board wholesale (upsert),
// stamps the sync row's freshness, and revalidateTag busts the cached read.
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

// The 304 path: bump freshness only, leaving the stored board + held etag untouched
// (the data is unchanged, so no revalidate). The sync row always exists here — a 304
// can only follow a prior fresh save that stored the replayed etag.
export async function stampCharacterJobsFresh(characterId: number): Promise<void> {
  await db
    .update(characterIndustryJobSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterIndustryJobSyncs.characterId, characterId));
}

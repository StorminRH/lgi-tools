// Neon read/write for the personal industry-jobs tracker (MIGRATE.B.2). The cached
// per-character read is the consumer surface; the write-behind half (replace-upsert +
// freshness stamp) and the live sync-state read serve the on-view refresh. Validation
// lives upstream (the ESI projection + the route layer); these accept already-typed
// values. DB-bound accessor — covered via integration + the consuming refresh, per the
// queries policy.
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

/** One cache tag per character so a refresh busts exactly that character's cached read. */
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

/**
 * The combined board map across the given characters (the caller passes the user's
 * linked character ids — listing them needs auth, which a feature slice may not
 * import). Composes the cached per-character reads; a never-synced character is absent.
 */
export async function getJobsForCharacters(
  characterIds: number[],
): Promise<Map<number, CharacterJobsData>> {
  return mapByIdDroppingNulls(characterIds, getCharacterJobs);
}

/**
 * Live (uncached) sync state for the staleness gate + etag replay (refresh path) and
 * the "as of" stamp (read path). Uncached on purpose: both need the true
 * last-refreshed time, not a cached view.
 */
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

/**
 * The write-behind. One single-page endpoint replaces the board wholesale (upsert),
 * stamps the sync row's freshness, and revalidateTag busts the cached read.
 */
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

/**
 * The 304 path: bump freshness only, leaving the stored board + held etag untouched
 * (the data is unchanged, so no revalidate). The sync row always exists here — a 304
 * can only follow a prior fresh save that stored the replayed etag.
 */
export async function stampCharacterJobsFresh(characterId: number): Promise<void> {
  await db
    .update(characterIndustryJobSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterIndustryJobSyncs.characterId, characterId));
}

// ── CORP industry jobs (MIGRATE.B.3) — the corp twins, keyed (user, corp) ──

/** One cache tag per (user, corp) so a refresh busts exactly that board's cached read. */
export function corpIndustryJobsTag(userId: string, corporationId: number): string {
  return `corp-industry-jobs:${userId}:${corporationId}`;
}

// Cached per-(user, corp) board — the granular consumer read. One cache entry + tag
// per board; cacheLife('minutes') gives sub-window freshness and the write-behind's
// revalidateTag busts it the moment a refresh persists new data. Returns null when the
// corp has never synced for this user (no row, or a needs_role/error row with no board).
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

/**
 * The combined board map across the given (user, corp) pairs. The caller passes the
 * corp ids the user currently has sync rows for (listing them is the uncached sync-state
 * read); a corp with no stored board is absent from the map.
 */
export async function getCorpJobsForUser(
  userId: string,
  corporationIds: number[],
): Promise<Map<number, CharacterJobsData>> {
  return mapByIdDroppingNulls(corporationIds, (id) => getCorpJobs(userId, id));
}

/**
 * Every corp the user currently has a sync row for, with its freshness, held etag, and
 * graceful error state. Uncached: the staleness gate + the "as of" stamp + the
 * needs_role surface all need the true current state, and this is also the enumeration
 * of which corps to render (the board table is corp-keyed but not user-enumerable on
 * its own). Ordered by corp id for a stable render.
 */
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

/**
 * Live (uncached) per-(user, corp) sync state for the refresh's staleness gate + etag
 * replay. Uncached on purpose: the refresh needs the true last-refreshed time.
 */
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

/**
 * The write-behind: a fresh body replaces the board wholesale (upsert), clears any prior
 * error, stamps freshness, and revalidateTag busts the cached read.
 */
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

/**
 * The graceful 'needs_role' path: no linked member holds the in-game role, so DROP the
 * board (don't keep serving jobs the user can no longer read), record the state, and
 * stamp freshness so a re-view inside the window doesn't re-resolve roles. The held
 * etag is cleared along with the board. revalidateTag busts the now-empty cached read.
 */
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

/**
 * The 304 path: bump freshness + clear any prior error, leaving the stored board +
 * held etag untouched (the data is unchanged, so no revalidate). The sync row always
 * exists here — a 304 can only follow a prior fresh save that stored the replayed etag.
 */
export async function stampCorpJobsFresh(userId: string, corporationId: number): Promise<void> {
  await db
    .update(corpIndustryJobSyncs)
    .set({ lastRefreshedAt: new Date(), syncError: null })
    .where(
      and(eq(corpIndustryJobSyncs.userId, userId), eq(corpIndustryJobSyncs.corporationId, corporationId)),
    );
}

// Neon read/write for the skill-queue tracker (MIGRATE.B.1). The cached per-character
// read is the consumer surface; the write-behind half (merge-upsert + freshness stamp)
// and the live sync-state read serve the on-view refresh. Validation lives upstream
// (the ESI projection + the route layer); these accept already-typed values. DB-bound
// accessor — covered via integration + the consuming refresh, per the queries.ts policy.
import { eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { characterSkills, characterSkillSyncs } from './schema';
import type { CharacterSkillData, CharacterSkillSyncState, SkillsSaveHalves } from './types';

// One cache tag per character so a refresh busts exactly that character's cached read.
export function skillsTag(characterId: number): string {
  return `skills:${characterId}`;
}

// Cached per-character payload — the granular consumer read. One cache entry + tag per
// character; cacheLife('minutes') gives sub-window freshness and the write-behind's
// revalidateTag busts it the moment a refresh persists new data. Returns null when the
// character has never synced (no row).
async function getCharacterSkills(characterId: number): Promise<CharacterSkillData | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(skillsTag(characterId));
  const rows = await db
    .select({
      queue: characterSkills.queue,
      totalSp: characterSkills.totalSp,
      unallocatedSp: characterSkills.unallocatedSp,
    })
    .from(characterSkills)
    .where(eq(characterSkills.characterId, characterId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const data: CharacterSkillData = { entries: row.queue, totalSp: row.totalSp };
  if (row.unallocatedSp !== null) data.unallocatedSp = row.unallocatedSp;
  return data;
}

// The combined payload map across the given characters (the caller passes the user's
// linked character ids — listing them needs auth, which a feature slice may not
// import). Composes the cached per-character reads; a never-synced character is absent.
export async function getSkillsForCharacters(
  characterIds: number[],
): Promise<Map<number, CharacterSkillData>> {
  const entries = await Promise.all(
    characterIds.map(async (id) => [id, await getCharacterSkills(id)] as const),
  );
  const map = new Map<number, CharacterSkillData>();
  for (const [id, data] of entries) {
    if (data !== null) map.set(id, data);
  }
  return map;
}

// Cached per-character trained-levels read for the planner's skills→time lever
// (3.7.19.1). Shares the character's skills tag, so the write-behind's revalidate
// busts it together with the payload read. Null when the character has never
// synced (no row) OR the row predates the skill_levels column (pre-0039) — both
// fail open to the no-skill baseline downstream.
export async function getCharacterSkillLevels(
  characterId: number,
): Promise<Record<string, number> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(skillsTag(characterId));
  const rows = await db
    .select({ skillLevels: characterSkills.skillLevels })
    .from(characterSkills)
    .where(eq(characterSkills.characterId, characterId))
    .limit(1);
  return rows[0]?.skillLevels ?? null;
}

// The trained-levels map across the given characters (the slots readout's batch —
// 3.7.24), composing the cached per-character reads like getSkillsForCharacters.
// Unlike that map, a never-synced character is KEPT with a null value: null is the
// meaningful fail-open signal downstream (base slot capacity), distinct from a
// present map that simply lacks a skill (rank 0).
export async function getSkillLevelsForCharacters(
  characterIds: number[],
): Promise<Map<number, Record<string, number> | null>> {
  const entries = await Promise.all(
    characterIds.map(async (id) => [id, await getCharacterSkillLevels(id)] as const),
  );
  return new Map(entries);
}

// Live (uncached) sync state for the staleness gate + etag replay (refresh path) and
// the "as of" stamp (read path). Uncached on purpose: both need the true
// last-refreshed time, not a cached view.
export async function readCharacterSyncState(
  characterId: number,
): Promise<CharacterSkillSyncState | null> {
  const rows = await db
    .select({
      lastRefreshedAt: characterSkillSyncs.lastRefreshedAt,
      queueEtag: characterSkillSyncs.queueEtag,
      skillsEtag: characterSkillSyncs.skillsEtag,
    })
    .from(characterSkillSyncs)
    .where(eq(characterSkillSyncs.characterId, characterId))
    .limit(1);
  const row = rows[0];
  return row
    ? { lastRefreshedAt: row.lastRefreshedAt, queueEtag: row.queueEtag, skillsEtag: row.skillsEtag }
    : null;
}

// The write-behind. Two single-page endpoints feed two columns each; a 304 half is
// omitted, so only the fresh half is written and the stored 304 half is untouched. A
// 304 implies a prior fresh save (the etag came from one), so the partial-update path
// always targets an existing row. Both halves present ⇒ a full upsert (the first-ever
// sync inserts; later both-fresh syncs replace). The sync row's freshness is stamped
// either way, and revalidateTag busts the cached read.
export async function saveCharacterSkills(
  characterId: number,
  halves: SkillsSaveHalves,
): Promise<void> {
  const now = new Date();
  const { queue, skills } = halves;

  if (queue !== undefined && skills !== undefined) {
    await db
      .insert(characterSkills)
      .values({
        characterId,
        totalSp: skills.totalSp,
        unallocatedSp: skills.unallocatedSp ?? null,
        queue: queue.entries,
        skillLevels: skills.levels,
      })
      .onConflictDoUpdate({
        target: characterSkills.characterId,
        set: {
          totalSp: skills.totalSp,
          unallocatedSp: skills.unallocatedSp ?? null,
          queue: queue.entries,
          skillLevels: skills.levels,
        },
      });
    await db
      .insert(characterSkillSyncs)
      .values({ characterId, lastRefreshedAt: now, queueEtag: queue.etag, skillsEtag: skills.etag })
      .onConflictDoUpdate({
        target: characterSkillSyncs.characterId,
        set: { lastRefreshedAt: now, queueEtag: queue.etag, skillsEtag: skills.etag },
      });
  } else if (queue !== undefined) {
    await db.update(characterSkills).set({ queue: queue.entries }).where(eq(characterSkills.characterId, characterId));
    await db
      .update(characterSkillSyncs)
      .set({ lastRefreshedAt: now, queueEtag: queue.etag })
      .where(eq(characterSkillSyncs.characterId, characterId));
  } else if (skills !== undefined) {
    await db
      .update(characterSkills)
      .set({ totalSp: skills.totalSp, unallocatedSp: skills.unallocatedSp ?? null, skillLevels: skills.levels })
      .where(eq(characterSkills.characterId, characterId));
    await db
      .update(characterSkillSyncs)
      .set({ lastRefreshedAt: now, skillsEtag: skills.etag })
      .where(eq(characterSkillSyncs.characterId, characterId));
  }

  revalidateTag(skillsTag(characterId), 'max');
}

// The both-304 path: bump freshness only, leaving stored data + held etags untouched
// (the data is unchanged, so no revalidate). The sync row always exists here — a 304
// can only follow a prior fresh save that stored the replayed etag.
export async function stampCharacterFresh(characterId: number): Promise<void> {
  await db
    .update(characterSkillSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterSkillSyncs.characterId, characterId));
}

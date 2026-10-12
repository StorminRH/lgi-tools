import { eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { expireNow } from '@/lib/cache-expiry';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { characterSkills, characterSkillSyncs } from './schema';
import type {
  CharacterSkillData,
  CharacterSkillRow,
  CharacterSkillSyncState,
  SkillsSaveHalves,
} from './types';

export function skillsTag(characterId: number): string {
  return `skills:${characterId}`;
}

async function getCharacterSkillRow(characterId: number): Promise<CharacterSkillRow | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(skillsTag(characterId));
  return readCharacterSkillRow(characterId);
}

export async function readCharacterSkillRow(characterId: number): Promise<CharacterSkillRow | null> {
  const rows = await db
    .select({
      queue: characterSkills.queue,
      totalSp: characterSkills.totalSp,
      unallocatedSp: characterSkills.unallocatedSp,
      skillLevels: characterSkills.skillLevels,
    })
    .from(characterSkills)
    .where(eq(characterSkills.characterId, characterId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const data: CharacterSkillData = { entries: row.queue, totalSp: row.totalSp };
  if (row.unallocatedSp !== null) data.unallocatedSp = row.unallocatedSp;
  return { data, levels: row.skillLevels ?? null };
}

export async function getSkillRowsForCharacters(
  characterIds: number[],
): Promise<Map<number, CharacterSkillRow>> {
  return mapByIdDroppingNulls(characterIds, getCharacterSkillRow);
}

export async function getCharacterSkillLevels(
  characterId: number,
): Promise<Record<string, number> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(skillsTag(characterId));
  return readCharacterSkillLevels(characterId);
}

async function readCharacterSkillLevels(characterId: number): Promise<Record<string, number> | null> {
  const rows = await db
    .select({ skillLevels: characterSkills.skillLevels })
    .from(characterSkills)
    .where(eq(characterSkills.characterId, characterId))
    .limit(1);
  return rows[0]?.skillLevels ?? null;
}

export async function getSkillLevelsForCharacters(
  characterIds: number[],
): Promise<Map<number, Record<string, number>>> {
  return mapByIdDroppingNulls(characterIds, getCharacterSkillLevels);
}

const syncStateColumns = {
  lastRefreshedAt: characterSkillSyncs.lastRefreshedAt,
};

export async function readCharacterSyncState(
  characterId: number,
): Promise<CharacterSkillSyncState | null> {
  const rows = await db
    .select(syncStateColumns)
    .from(characterSkillSyncs)
    .where(eq(characterSkillSyncs.characterId, characterId))
    .limit(1);
  return rows[0] ?? null;
}

/** Uncached, in one query: each listed character's sync state; a character with no row is absent. */
export async function listCharacterSkillSyncStates(
  characterIds: number[],
): Promise<Map<number, CharacterSkillSyncState>> {
  if (characterIds.length === 0) return new Map();
  const rows = await db
    .select({ characterId: characterSkillSyncs.characterId, ...syncStateColumns })
    .from(characterSkillSyncs)
    .where(inArray(characterSkillSyncs.characterId, characterIds));
  return new Map(rows.map(({ characterId, ...state }) => [characterId, state]));
}

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

  expireNow(skillsTag(characterId));
}

export async function stampCharacterFresh(characterId: number): Promise<void> {
  await db
    .update(characterSkillSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterSkillSyncs.characterId, characterId));
}

import { eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { db } from '@/db';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { characterSkills, characterSkillSyncs } from './schema';
import type { CharacterSkillData, CharacterSkillSyncState, SkillsSaveHalves } from './types';

export function skillsTag(characterId: number): string {
  return `skills:${characterId}`;
}

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

export async function getSkillsForCharacters(
  characterIds: number[],
): Promise<Map<number, CharacterSkillData>> {
  return mapByIdDroppingNulls(characterIds, getCharacterSkills);
}

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

export async function getSkillLevelsForCharacters(
  characterIds: number[],
): Promise<Map<number, Record<string, number> | null>> {
  const entries = await Promise.all(
    characterIds.map(async (id) => [id, await getCharacterSkillLevels(id)] as const),
  );
  return new Map(entries);
}

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

export async function stampCharacterFresh(characterId: number): Promise<void> {
  await db
    .update(characterSkillSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterSkillSyncs.characterId, characterId));
}

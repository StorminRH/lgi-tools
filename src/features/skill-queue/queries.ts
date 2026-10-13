import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { datasetTag, storedExpiry, untilExpires } from '@/data/esi-store';
import { db } from '@/db';
import { excludedSet, proposedRowsWhere } from '@/lib/db-upsert';
import type { OwnerWrite } from '@/platform/owner-sync';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { skillsKey, skillsKeys } from './keys';
import { characterSkills, characterSkillSyncs } from './schema';
import type {
  CharacterSkillData,
  CharacterSkillRow,
  CharacterSkillSyncState,
  SkillsSaveHalves,
} from './types';

/**
 * One character's skills row, cached across instances until the earlier of
 * its two stored answers expires; the sync's commit clears the tag when a
 * 200 lands, so nothing here decides freshness.
 */
async function getCharacterSkillRow(characterId: number): Promise<CharacterSkillRow | null> {
  'use cache: remote';
  cacheTag(datasetTag(skillsKey(characterId)));
  const [row, expiresAt] = await Promise.all([readCharacterSkillRow(characterId), storedExpiry(skillsKeys(characterId))]);
  cacheLife(untilExpires(expiresAt));
  return row;
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
  'use cache: remote';
  cacheTag(datasetTag(skillsKey(characterId)));
  const [levels, expiresAt] = await Promise.all([readCharacterSkillLevels(characterId), storedExpiry(skillsKeys(characterId))]);
  cacheLife(untilExpires(expiresAt));
  return levels;
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

/**
 * The halves that answered 200, as statements the refresh's commit sends
 * with its answers. Both halves upsert the whole row; one half updates its
 * own columns of a row that already exists. Every statement applies only
 * where those answers stand, so an older answer writes neither half.
 */
export function saveCharacterSkills(characterId: number, halves: SkillsSaveHalves): OwnerWrite {
  const now = new Date();
  return { kind: 'statements', build: (answersStand) => skillsStatements(characterId, halves, now, answersStand) };
}

function skillsStatements(characterId: number, halves: SkillsSaveHalves, now: Date, answersStand: SQL) {
  const { queue, skills } = halves;
  if (queue !== undefined && skills !== undefined) {
    const row = {
      characterId,
      totalSp: skills.totalSp,
      unallocatedSp: skills.unallocatedSp ?? null,
      queue: queue.entries,
      skillLevels: skills.levels,
    };
    const sync = { characterId, lastRefreshedAt: now, queueEtag: queue.etag, skillsEtag: skills.etag };
    return [
      db
        .insert(characterSkills)
        .select(proposedRowsWhere(characterSkills, [row], answersStand))
        .onConflictDoUpdate({
          target: characterSkills.characterId,
          set: excludedSet(characterSkills, ['totalSp', 'unallocatedSp', 'queue', 'skillLevels']),
        }),
      db
        .insert(characterSkillSyncs)
        .select(proposedRowsWhere(characterSkillSyncs, [sync], answersStand))
        .onConflictDoUpdate({
          target: characterSkillSyncs.characterId,
          set: excludedSet(characterSkillSyncs, ['lastRefreshedAt', 'queueEtag', 'skillsEtag']),
        }),
    ];
  }
  const skillsRow = and(eq(characterSkills.characterId, characterId), answersStand);
  const syncRow = and(eq(characterSkillSyncs.characterId, characterId), answersStand);
  if (queue !== undefined) {
    return [
      db.update(characterSkills).set({ queue: queue.entries }).where(skillsRow),
      db.update(characterSkillSyncs).set({ lastRefreshedAt: now, queueEtag: queue.etag }).where(syncRow),
    ];
  }
  if (skills !== undefined) {
    return [
      db
        .update(characterSkills)
        .set({ totalSp: skills.totalSp, unallocatedSp: skills.unallocatedSp ?? null, skillLevels: skills.levels })
        .where(skillsRow),
      db.update(characterSkillSyncs).set({ lastRefreshedAt: now, skillsEtag: skills.etag }).where(syncRow),
    ];
  }
  return [];
}

export async function stampCharacterFresh(characterId: number): Promise<void> {
  await db
    .update(characterSkillSyncs)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(characterSkillSyncs.characterId, characterId));
}

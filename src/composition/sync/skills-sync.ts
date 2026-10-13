import { after } from 'next/server';
import { isDue, recordRefusal } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { accountBelongsToUser, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { skillQueueKey, skillsDueKeys, skillsKey, skillsKeys } from '@/features/skill-queue/keys';
import {
  getCharacterSkillLevels,
  getSkillLevelsForCharacters,
  readCharacterSyncState,
  saveCharacterSkills,
  stampCharacterFresh,
} from '@/features/skill-queue/queries';
import { refreshSkillsForUser } from '@/features/skill-queue/refresh';
import type { SkillsPort } from '@/features/skill-queue/types';
import { singleFlight } from '@/lib/memoize';
import { refreshDue } from './live-dataset-view';
import { listCharactersWithHealth, vendTokenFor } from './owner-sync-port';

function makeSkillsPort(): SkillsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    isDue: (characterId) => isDue(skillsKeys(characterId)),
    openSession: openReadSession,
    readSkillQueue: (session, characterId, accessToken) => session.readAuthed(skillQueueKey(characterId), accessToken),
    readSkills: (session, characterId, accessToken) => session.readAuthed(skillsKey(characterId), accessToken),
    readSyncState: (characterId) => readCharacterSyncState(characterId),
    saveSkills: (characterId, halves) => saveCharacterSkills(characterId, halves),
    stampFresh: (characterId) => stampCharacterFresh(characterId),
    recordRefusal: (characterId, expiresAt) => recordRefusal(skillsKeys(characterId), expiresAt),
  };
}

const skillsInFlight = singleFlight((userId: string) => refreshSkillsForUser(makeSkillsPort(), userId));

/** The refresh a view schedules: concurrent calls for one user in this process share one run, and a call after it settles runs again. */
export function refreshSkillsOnView(userId: string) {
  return skillsInFlight(userId);
}

export interface ViewerSkillLevels {
  characterId: number;
  levels: Record<string, number> | null;
}

/**
 * The slots readout's batched on-view levels read (3.7.24): every linked
 * character's trained levels in one pass.
 * Fires exactly ONE write-behind per view; refreshSkillsForUser asks the
 * response store whether each character's answers have expired BEFORE any
 * token vend or ESI call, so a re-view inside CCP's expiry is a pure Neon
 * read — there is no unconditional N-character refresh storm.
 */
export async function getSkillLevelsForUserOnView(
  userId: string,
): Promise<{ characters: ViewerSkillLevels[]; refreshing: boolean }> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const [levelsMap, refreshing] = await Promise.all([
    getSkillLevelsForCharacters(characterIds),
    refreshDue(userId, skillsDueKeys),
  ]);
  after(() => refreshSkillsOnView(userId));
  return {
    characters: characterIds.map((characterId) => ({
      characterId,
      levels: levelsMap.get(characterId) ?? null,
    })),
    refreshing,
  };
}

export async function getSkillLevelsForCharacterOnView(
  userId: string,
  characterId: number,
): Promise<Record<string, number> | null> {
  if (!(await accountBelongsToUser(userId, characterId))) return null;
  const levels = await getCharacterSkillLevels(characterId);
  after(() => refreshSkillsOnView(userId));
  return levels;
}

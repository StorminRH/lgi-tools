import { after } from 'next/server';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import {
  getCharacterSkillLevels,
  getSkillLevelsForCharacters,
  getSkillsForCharacters,
  readCharacterSyncState,
  saveCharacterSkills,
  stampCharacterFresh,
} from '@/features/skill-queue/queries';
import { refreshSkillsForUser } from '@/features/skill-queue/refresh';
import type { CharacterSkillData, SkillsPort } from '@/features/skill-queue/types';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import { characterRow, getLiveDatasetOnView, readCharacterOwners } from './live-dataset-view';
import { listCharactersWithHealth, readSingleEndpoint, vendTokenFor } from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';

function makeSkillsPort(): SkillsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readSkillQueue: (characterId, accessToken, heldEtag) =>
      readSingleEndpoint(`/characters/${characterId}/skillqueue/`, accessToken, heldEtag),
    readSkills: (characterId, accessToken, heldEtag) =>
      readSingleEndpoint(`/characters/${characterId}/skills/`, accessToken, heldEtag),
    readSyncState: (characterId) => readCharacterSyncState(characterId),
    saveSkills: (characterId, halves) => saveCharacterSkills(characterId, halves),
    stampFresh: (characterId) => stampCharacterFresh(characterId),
  };
}

export interface ViewerSkills {
  characterId: number;
  data: CharacterSkillData | null;
  lastRefreshedAt: number | null;
}

export interface ViewerSkillsResult {
  characters: ViewerSkills[];
  names: Record<string, string>;
}

export async function getSkillsForUserOnView(userId: string): Promise<ViewerSkillsResult> {
  const { rows, names } = await getLiveDatasetOnView<CharacterSkillData, ViewerSkills>(userId, {
    read: (uid) => readCharacterOwners(uid, getSkillsForCharacters, readCharacterSyncState),
    refresh: (uid) =>
      refreshSkillsForUser(makeSkillsPort(), uid, enqueueBudgetDeferral('skills', uid)),
    makeRow: characterRow,
    nameIds: (viewerSkills) => {
      const skillIds = new Set<number>();
      for (const character of viewerSkills) {
        for (const entry of character.data?.entries ?? []) skillIds.add(entry.skill_id);
      }
      return skillIds;
    },
  });
  return { characters: rows, names };
}

export interface ViewerSkillLevels {
  characterId: number;
  levels: Record<string, number> | null;
}

/**
 * The slots readout's batched on-view levels read (3.7.24): every linked
 * character's trained levels in one pass, mirroring getSkillsForUserOnView.
 * Fires exactly ONE write-behind per view; refreshSkillsForUser checks each
 * character's lastRefreshedAt against the 120s staleness gate BEFORE any token
 * vend or ESI call, so a re-view inside the window is a pure Neon read — there
 * is no unconditional N-character refresh storm.
 */
export async function getSkillLevelsForUserOnView(userId: string): Promise<ViewerSkillLevels[]> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const levelsMap = await getSkillLevelsForCharacters(characterIds);
  after(() =>
    refreshSkillsForUser(makeSkillsPort(), userId, enqueueBudgetDeferral('skills', userId)),
  );
  return characterIds.map((characterId) => ({
    characterId,
    levels: levelsMap.get(characterId) ?? null,
  }));
}

export async function getSkillLevelsForCharacterOnView(
  userId: string,
  characterId: number,
): Promise<Record<string, number> | null> {
  const linked = await listLinkedCharacters(userId);
  if (!linked.some((character) => character.characterId === characterId)) return null;
  const levels = await getCharacterSkillLevels(characterId);
  after(() =>
    refreshSkillsForUser(makeSkillsPort(), userId, enqueueBudgetDeferral('skills', userId)),
  );
  return levels;
}

export async function runSkillsRefreshJob(
  userId: string,
  target: OwnerSyncTarget,
): Promise<OwnerSyncResult> {
  const results = await refreshSkillsForUser(makeSkillsPort(), userId, { target });
  return targetedOwnerResult(target, results);
}

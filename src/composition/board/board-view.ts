import { after } from 'next/server';
import { getCharacterSheets } from '@/features/character-sheet/queries';
import { getJobsForCharacters, readCharacterJobSyncState } from '@/features/industry-jobs/queries';
import {
  getSkillLevelsForCharacters,
  getSkillsForCharacters,
  readCharacterSyncState,
} from '@/features/skill-queue/queries';
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { refreshCharacterSheetsOnView } from '@/composition/sync/character-sheet-sync';
import { refreshJobsOnView } from '@/composition/sync/industry-jobs-sync';
import { refreshSkillsOnView } from '@/composition/sync/skills-sync';
import type { BoardResponse } from './api-contract';
import { assembleBoard, type BoardRaw, collectNameIds } from './board-assemble';
import { resolveNameBook } from './name-book';

async function readRaws(linked: LinkedCharacter[]): Promise<BoardRaw[]> {
  const ids = linked.map((character) => character.characterId);
  const [sheets, skills, levels, skillStates, jobs, jobStates] = await Promise.all([
    getCharacterSheets(ids),
    getSkillsForCharacters(ids),
    getSkillLevelsForCharacters(ids),
    Promise.all(ids.map((id) => readCharacterSyncState(id))),
    getJobsForCharacters(ids),
    Promise.all(ids.map((id) => readCharacterJobSyncState(id))),
  ]);
  return linked.map((character, i) => {
    const id = character.characterId;
    return {
      identity: {
        characterId: id,
        name: character.name,
        portraitUrl: character.portraitUrl,
        corporationId: character.corporationId,
        allianceId: character.allianceId,
      },
      health: {
        hasRefreshToken: character.hasRefreshToken,
        missingScopes: deriveCharacterHealth(character).missingScopes,
      },
      sheet: sheets.get(id) ?? null,
      skills: {
        data: skills.get(id) ?? null,
        levels: levels.get(id) ?? null,
        refreshedAt: skillStates[i]?.lastRefreshedAt?.getTime() ?? null,
      },
      jobs: {
        data: jobs.get(id) ?? null,
        refreshedAt: jobStates[i]?.lastRefreshedAt?.getTime() ?? null,
      },
    };
  });
}

/** Viewing the board is the refresh trigger: one Neon read now, one write-behind for all three datasets. */
export async function getBoardForUserOnView(userId: string): Promise<BoardResponse> {
  const linked = await listLinkedCharacters(userId);
  const raws = await readRaws(linked);
  after(() =>
    Promise.all([refreshSkillsOnView(userId), refreshJobsOnView(userId), refreshCharacterSheetsOnView(userId)]),
  );
  const names = await resolveNameBook(collectNameIds(raws));
  return assembleBoard(raws, names, Date.now());
}

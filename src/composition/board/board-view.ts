import { after } from 'next/server';
import { getCharacterSheets } from '@/features/character-sheet/queries';
import { getJobsForCharacters, readCharacterJobSyncState } from '@/features/industry-jobs/queries';
import { getNetWorthHistory, upsertNetWorthDay, utcDay } from '@/features/net-worth/queries';
import { listCharacterAssetRows, readOwnerSyncState } from '@/features/owned-assets/queries';
import {
  getSkillLevelsForCharacters,
  getSkillsForCharacters,
  readCharacterSyncState,
} from '@/features/skill-queue/queries';
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { refreshCharacterSheetsOnView } from '@/composition/sync/character-sheet-sync';
import { refreshJobsOnView } from '@/composition/sync/industry-jobs-sync';
import { refreshCharacterAssetsOnView } from '@/composition/sync/owned-assets-sync';
import { refreshSkillsOnView } from '@/composition/sync/skills-sync';
import type { BoardResponse } from './api-contract';
import { assembleBoard, type BoardRaw, collectNameIds, netWorthSnapshot, toHistoryDay } from './board-assemble';
import { resolveNameBook } from './name-book';
import { seedUnpricedTypes } from './price-book';

async function readRaws(linked: LinkedCharacter[]): Promise<BoardRaw[]> {
  const ids = linked.map((character) => character.characterId);
  const [sheets, skills, levels, skillStates, jobs, jobStates, assets, assetStates] = await Promise.all([
    getCharacterSheets(ids),
    getSkillsForCharacters(ids),
    getSkillLevelsForCharacters(ids),
    Promise.all(ids.map((id) => readCharacterSyncState(id))),
    getJobsForCharacters(ids),
    Promise.all(ids.map((id) => readCharacterJobSyncState(id))),
    listCharacterAssetRows(ids),
    Promise.all(ids.map((id) => readOwnerSyncState({ ownerType: 'character', ownerId: id }))),
  ]);
  return linked.map((character, i) => {
    const id = character.characterId;
    const assetsSyncedAt = assetStates[i]?.lastRefreshedAt?.getTime() ?? null;
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
      assets: {
        rows: assetsSyncedAt === null ? null : (assets.get(id) ?? []),
        refreshedAt: assetsSyncedAt,
      },
    };
  });
}

/**
 * Runs after the write-behind refreshes: re-reads the roster, values it, records the account's day
 * (last view of the day wins) and seeds price rows for owned types the nightly sweep has never seen.
 * A roster with no computable pilot records nothing, so a fresh account's chart never starts at zero.
 */
export async function recordNetWorthSnapshot(userId: string, now = new Date()): Promise<void> {
  const linked = await listLinkedCharacters(userId);
  if (linked.length === 0) return;
  const raws = await readRaws(linked);
  const names = await resolveNameBook(collectNameIds(raws));
  const board = assembleBoard(raws, names, now.getTime(), []);
  const snapshot = netWorthSnapshot(board.characters, utcDay(now));
  if (snapshot.pilotsIncluded > 0) await upsertNetWorthDay(userId, snapshot, now);
  await seedUnpricedTypes(names.unseededTypeIds);
}

function refreshEverything(userId: string): Promise<unknown> {
  return Promise.allSettled([
    refreshSkillsOnView(userId),
    refreshJobsOnView(userId),
    refreshCharacterSheetsOnView(userId),
    refreshCharacterAssetsOnView(userId),
  ]);
}

export async function getBoardForUserOnView(userId: string): Promise<BoardResponse> {
  const linked = await listLinkedCharacters(userId);
  const raws = await readRaws(linked);
  after(async () => {
    await refreshEverything(userId);
    await recordNetWorthSnapshot(userId);
  });
  const [names, history] = await Promise.all([resolveNameBook(collectNameIds(raws)), getNetWorthHistory(userId)]);
  return assembleBoard(raws, names, Date.now(), history.map(toHistoryDay));
}

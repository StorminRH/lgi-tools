import { after } from 'next/server';
import { getCharacterSheets, readSheetRow } from '@/features/character-sheet/queries';
import { getJobsForCharacters, readCharacterJobs, readCharacterJobSyncState } from '@/features/industry-jobs/queries';
import { getNetWorthHistory, upsertNetWorthDay, utcDay } from '@/features/net-worth/queries';
import { listCharacterAssetRows, readOwnerAssetRows, readOwnerSyncState } from '@/features/owned-assets/queries';
import {
  getSkillLevelsForCharacters,
  getSkillsForCharacters,
  readCharacterSkills,
  readCharacterSkillLevels,
  readCharacterSyncState,
} from '@/features/skill-queue/queries';
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { refreshCharacterSheetsOnView } from '@/composition/sync/character-sheet-sync';
import { refreshJobsOnView } from '@/composition/sync/industry-jobs-sync';
import { refreshCharacterAssetsOnView } from '@/composition/sync/owned-assets-sync';
import { refreshSkillsOnView } from '@/composition/sync/skills-sync';
import type { BoardResponse } from './api-contract';
import { assembleBoard, type BoardRaw, collectNameIds, netWorthSnapshot, toHistoryDay } from './board-assemble';
import { resolveNameBook } from './name-book';
import { seedUnpricedTypes } from './price-book';

async function readRaws(linked: LinkedCharacter[], fresh = false): Promise<BoardRaw[]> {
  const ids = linked.map((character) => character.characterId);
  const [sheets, skills, levels, skillStates, jobs, jobStates, assets, assetStates] = await Promise.all([
    fresh ? mapByIdDroppingNulls(ids, readSheetRow) : getCharacterSheets(ids),
    fresh ? mapByIdDroppingNulls(ids, readCharacterSkills) : getSkillsForCharacters(ids),
    fresh ? mapByIdDroppingNulls(ids, readCharacterSkillLevels) : getSkillLevelsForCharacters(ids),
    Promise.all(ids.map((id) => readCharacterSyncState(id))),
    fresh ? mapByIdDroppingNulls(ids, readCharacterJobs) : getJobsForCharacters(ids),
    Promise.all(ids.map((id) => readCharacterJobSyncState(id))),
    fresh
      ? mapByIdDroppingNulls(ids, (ownerId) => readOwnerAssetRows({ ownerType: 'character', ownerId }))
      : listCharacterAssetRows(ids),
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
 * Values the account from what Neon already holds (no ESI) and records the day; the last write of the day
 * wins. The nightly revalue runs it after the price sweep, and a character link runs it after that pilot's
 * first sync. A roster with no computable pilot records nothing, so a fresh account's chart never starts at
 * zero. Owned types the sweep has never priced are seeded so the next sweep prices them; until then the CCP
 * average values them.
 */
export async function recordNetWorthSnapshot(userId: string, now = new Date()): Promise<void> {
  const linked = await listLinkedCharacters(userId);
  if (linked.length === 0) return;
  // SWR caches can still hold the pre-refresh view here; snapshots must read the completed writes.
  const raws = await readRaws(linked, true);
  const names = await resolveNameBook(collectNameIds(raws));
  const snapshot = netWorthSnapshot(raws, names, utcDay(now));
  if (snapshot.pilotsIncluded > 0) await upsertNetWorthDay(userId, snapshot, now);
  await seedUnpricedTypes(names.unseededTypeIds);
}

export function refreshBoardDatasets(userId: string): Promise<unknown> {
  return Promise.allSettled([
    refreshSkillsOnView(userId),
    refreshJobsOnView(userId),
    refreshCharacterSheetsOnView(userId),
    refreshCharacterAssetsOnView(userId),
  ]);
}

/**
 * Serves net worth from the recorded days only: the view refreshes the pilots' datasets behind their
 * freshness gates but never values or records them, so nothing prices on view.
 */
export async function getBoardForUserOnView(userId: string): Promise<BoardResponse> {
  const linked = await listLinkedCharacters(userId);
  const raws = await readRaws(linked);
  after(() => refreshBoardDatasets(userId));
  const [names, history] = await Promise.all([
    resolveNameBook({ ...collectNameIds(raws), valuationTypeIds: [] }),
    getNetWorthHistory(userId),
  ]);
  return assembleBoard(raws, names, Date.now(), history.map(toHistoryDay));
}

import { jobTypeIds } from '@/features/industry-jobs/esi-projection';
import {
  getJobsForCharacters,
  listCharacterJobSyncStates,
  readCharacterJobSyncState,
  saveCharacterJobs,
  stampCharacterJobsFresh,
} from '@/features/industry-jobs/queries';
import { refreshJobsForUser } from '@/features/industry-jobs/refresh';
import type { CharacterJobsData, JobsPort } from '@/features/industry-jobs/types';
import { characterRow, getLiveDatasetOnView, readCharacterOwners } from './live-dataset-view';
import { listCharactersWithHealth, readSingleEndpoint, vendTokenFor } from './owner-sync-port';

function makeJobsPort(): JobsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readJobs: (characterId, accessToken, heldEtag) =>
      readSingleEndpoint(`/characters/${characterId}/industry/jobs/`, accessToken, heldEtag),
    readSyncState: (characterId) => readCharacterJobSyncState(characterId),
    saveJobs: (characterId, jobs, etag) => saveCharacterJobs(characterId, jobs, etag),
    stampFresh: (characterId) => stampCharacterJobsFresh(characterId),
  };
}

export const refreshJobsOnView = (userId: string) => refreshJobsForUser(makeJobsPort(), userId);

export interface ViewerJobs {
  characterId: number;
  data: CharacterJobsData | null;
  lastRefreshedAt: number | null;
}

export interface ViewerJobsResult {
  characters: ViewerJobs[];
  names: Record<string, string>;
}

export async function getJobsForUserOnView(userId: string): Promise<ViewerJobsResult> {
  const { rows, names } = await getLiveDatasetOnView<CharacterJobsData, ViewerJobs>(userId, {
    read: (uid) => readCharacterOwners(uid, getJobsForCharacters, listCharacterJobSyncStates),
    refresh: refreshJobsOnView,
    makeRow: characterRow,
    nameIds: (viewerJobs) => jobTypeIds(viewerJobs),
  });
  return { characters: rows, names };
}

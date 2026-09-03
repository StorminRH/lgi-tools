import { refreshCorpJobsForUser } from '@/features/industry-jobs/corp-refresh';
import { jobTypeIds } from '@/features/industry-jobs/esi-projection';
import {
  getCorpJobsForUser,
  listCorpJobSyncStates,
  readCorpJobSyncState,
  saveCorpJobs,
  saveCorpNeedsRole,
  stampCorpJobsFresh,
} from '@/features/industry-jobs/queries';
import type { CharacterJobsData, CorpJobsPort } from '@/features/industry-jobs/types';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/platform/owner-sync';
import { getLiveDatasetOnView, type OwnerRow } from './live-dataset-view';
import { listCharactersWithHealth, readRolesFor, readSingleEndpoint, vendTokenFor } from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';

function makeCorpJobsPort(): CorpJobsPort {
  return {
    now: () => new Date(),
    listMembers: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesFor,
    readJobs: (corporationId, accessToken, heldEtag) =>
      readSingleEndpoint(`/corporations/${corporationId}/industry/jobs/`, accessToken, heldEtag),
    readSyncState: (userId, corporationId) => readCorpJobSyncState(userId, corporationId),
    saveJobs: (userId, corporationId, jobs, etag) => saveCorpJobs(userId, corporationId, jobs, etag),
    saveNeedsRole: (userId, corporationId) => saveCorpNeedsRole(userId, corporationId),
    stampFresh: (userId, corporationId) => stampCorpJobsFresh(userId, corporationId),
  };
}

export interface ViewerCorpJobs {
  corporationId: number;
  data: CharacterJobsData | null;
  lastRefreshedAt: number | null;
  syncError: string | null;
}

export interface ViewerCorpJobsResult {
  corporations: ViewerCorpJobs[];
  names: Record<string, string>;
}

export async function getCorpJobsForUserOnView(userId: string): Promise<ViewerCorpJobsResult> {
  const { rows, names } = await getLiveDatasetOnView<CharacterJobsData, ViewerCorpJobs>(userId, {

    read: async (uid) => {
      const syncStates = await listCorpJobSyncStates(uid);
      const owners: OwnerRow[] = syncStates.map((state) => ({
        id: state.corporationId,
        lastRefreshedAt: state.lastRefreshedAt,
        syncError: state.syncError,
      }));
      const data = await getCorpJobsForUser(
        uid,
        owners.map((owner) => owner.id),
      );
      return { owners, data };
    },
    refresh: (uid) =>
      refreshCorpJobsForUser(
        makeCorpJobsPort(),
        uid,
        enqueueBudgetDeferral('corporation_industry_jobs', uid),
      ),
    makeRow: (owner, data) => ({
      corporationId: owner.id,
      data,
      lastRefreshedAt: owner.lastRefreshedAt?.getTime() ?? null,
      syncError: owner.syncError ?? null,
    }),
    nameIds: (viewerCorpJobs) => jobTypeIds(viewerCorpJobs),
  });
  return { corporations: rows, names };
}

export async function runCorporationIndustryJobsRefreshJob(
  userId: string,
  target: OwnerSyncTarget,
): Promise<OwnerSyncResult> {
  const results = await refreshCorpJobsForUser(makeCorpJobsPort(), userId, { target });
  return targetedOwnerResult(target, results);
}

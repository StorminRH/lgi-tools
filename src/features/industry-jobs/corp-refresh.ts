import {
  makeCorpDescriptor,
  type OwnerSyncResult,
  planRead,
  runOwnerSync,
} from '@/platform/owner-sync';
import type { EsiReadSession } from '@/data/esi-store/session';
import { CORP_INDUSTRY_JOBS_REQUIRED_ROLES, canSyncCorpIndustryJobs } from './corp-sync-eligibility';
import { type IndustryJob, parseIndustryJobsBody } from './esi-projection';
import type { CorpJobsPort, CorpJobsSyncState } from './types';

interface CorpOwner {
  userId: string;
  corporationId: number;
}

interface CorpJobsSave {
  jobs: IndustryJob[];
  etag: string | null;
}

function makeDescriptor(port: CorpJobsPort) {
  return makeCorpDescriptor<CorpOwner, CorpJobsSyncState, CorpJobsSave, EsiReadSession>(port, {
    ownerOf: (userId, corporationId) => ({ userId, corporationId }),
    eligible: canSyncCorpIndustryJobs,
    requiredRoles: CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
    isDue: (owner) => port.isDue(owner.userId, owner.corporationId),
    readState: (owner) => port.readSyncState(owner.userId, owner.corporationId),
    fetchAndPlan: async (owner, accessToken, _state, session) => {
      const read = await port.readJobs(session, owner.userId, owner.corporationId, accessToken);
      return planRead(read, (fresh) => {
        const jobs = parseIndustryJobsBody(fresh.body);
        return jobs === null ? null : { jobs, etag: fresh.etag };
      });
    },
    save: (owner, payload) => port.saveJobs(owner.userId, owner.corporationId, payload.jobs, payload.etag),
    stampFresh: (owner) => port.stampFresh(owner.userId, owner.corporationId),
    saveGateState: (owner) => port.saveNeedsRole(owner.userId, owner.corporationId),
  });
}

export function refreshCorpJobsForUser(
  port: CorpJobsPort,
  userId: string,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId);
}

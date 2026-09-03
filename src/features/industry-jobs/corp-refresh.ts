import {
  makeCorpDescriptor,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
  planRead,
  runOwnerSync,
} from '@/platform/owner-sync';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { CORP_INDUSTRY_JOBS_REQUIRED_ROLES, canSyncCorpIndustryJobs } from './corp-sync-eligibility';
import { type IndustryJob, parseIndustryJobsBody } from './esi-projection';
import type { CorpJobsPort, CorpJobsSyncState } from './types';

const CORP_JOBS_FRESHNESS = freshnessGate('corporation_industry_jobs');

interface CorpOwner {
  userId: string;
  corporationId: number;
}

interface CorpJobsSave {
  jobs: IndustryJob[];
  etag: string | null;
}

function makeDescriptor(port: CorpJobsPort) {
  return makeCorpDescriptor<CorpOwner, CorpJobsSyncState, CorpJobsSave>(port, {
    ownerOf: (userId, corporationId) => ({ userId, corporationId }),
    eligible: (owner) => canSyncCorpIndustryJobs(owner),
    requiredRoles: CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
    isStale: CORP_JOBS_FRESHNESS.isStale,
    readState: (owner) => port.readSyncState(owner.userId, owner.corporationId),
    fetchAndPlan: async (owner, accessToken, state) => {
      const read = await port.readJobs(owner.corporationId, accessToken, state?.jobsEtag ?? null);
      return planRead(
        read,
        (fresh) => {
          const jobs = parseIndustryJobsBody(fresh.body);
          return jobs === null ? null : { jobs, etag: fresh.etag };
        },
        (code) => (code === 'esi_403' ? { kind: 'needs_role' } : { kind: 'skip', code }),
      );
    },
    save: (owner, payload) => port.saveJobs(owner.userId, owner.corporationId, payload.jobs, payload.etag),
    stampFresh: (owner) => port.stampFresh(owner.userId, owner.corporationId),
    saveGateState: (owner) => port.saveNeedsRole(owner.userId, owner.corporationId),
  });
}

export function refreshCorpJobsForUser(
  port: CorpJobsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId, options);
}

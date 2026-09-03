import {
  makeCharacterDescriptor,
  type OwnerSyncDescriptor,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
  planRead,
  runOwnerSync,
} from '@/platform/owner-sync';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { type IndustryJob, parseIndustryJobsBody } from './esi-projection';
import { canSyncIndustryJobs } from './sync-eligibility';
import type { CharacterJobsSyncState, JobsPort } from './types';

const JOBS_FRESHNESS = freshnessGate('character_industry_jobs');

interface JobsSave {
  jobs: IndustryJob[];
  etag: string | null;
}

function makeDescriptor(port: JobsPort): OwnerSyncDescriptor<number, CharacterJobsSyncState, JobsSave> {
  return makeCharacterDescriptor(port, {
    isStale: JOBS_FRESHNESS.isStale,
    eligible: canSyncIndustryJobs,
    fetchAndPlan: async (characterId, accessToken, state) => {
      const read = await port.readJobs(characterId, accessToken, state?.jobsEtag ?? null);
      return planRead(read, (fresh) => {
        const jobs = parseIndustryJobsBody(fresh.body);
        return jobs === null ? null : { jobs, etag: fresh.etag };
      });
    },
    save: (characterId, payload) => port.saveJobs(characterId, payload.jobs, payload.etag),
  });
}

export function refreshJobsForUser(
  port: JobsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId, options);
}

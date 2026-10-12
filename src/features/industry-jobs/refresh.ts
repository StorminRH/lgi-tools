import type { EsiReadSession } from '@/data/esi-store/session';
import {
  makeCharacterDescriptor,
  type OwnerSyncDescriptor,
  type OwnerSyncResult,
  planRead,
  runOwnerSync,
} from '@/platform/owner-sync';
import { type IndustryJob, parseIndustryJobsBody } from './esi-projection';
import { canSyncIndustryJobs } from './sync-eligibility';
import type { CharacterJobsSyncState, JobsPort } from './types';

interface JobsSave {
  jobs: IndustryJob[];
  etag: string | null;
}

function makeDescriptor(port: JobsPort): OwnerSyncDescriptor<number, CharacterJobsSyncState, JobsSave, EsiReadSession> {
  return makeCharacterDescriptor(port, {
    eligible: canSyncIndustryJobs,
    fetchAndPlan: async (characterId, accessToken, _state, session) => {
      const read = await port.readJobs(session, characterId, accessToken);
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
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId);
}

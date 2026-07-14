// The on-view personal industry-jobs refresh (MIGRATE.B.2; engine-backed since
// MIGRATE.D.2). PURE orchestration: refreshJobsForUser builds an OwnerSyncDescriptor
// from the injected port (types.ts) + this slice's pure helpers and hands it to the
// shared per-owner sync engine (src/lib/owner-sync). It imports no auth and no DB, so
// it stays inside the feature boundary and is unit-tested with a fake port. The real
// port is wired in src/db/industry-jobs-sync.ts. Jobs is per-character only — one
// parallel pass, no corp axis.
//
// The engine checks the staleness gate BEFORE any token vend or ESI call (a fresh
// character does zero work). The refresh reconciles EXISTENCE (new / delivered jobs in
// the next fresh body); a job's "ready" is derived client-side from its absolute
// end_date — there is no scheduled completion flip. planJobsPersist (the single-read
// save/stamp/skip decision) stays here; refresh.test.ts pins the byte-identical dance.
import {
  makeCharacterDescriptor,
  type OwnerSyncDescriptor,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
  runOwnerSync,
} from '@/lib/owner-sync';
import { type IndustryJob, parseIndustryJobsBody } from './esi-projection';
import { isJobsStale } from './staleness';
import { canSyncIndustryJobs } from './sync-eligibility';
import type { CharacterJobsSyncState, JobsEsiRead, JobsPort } from './types';

// What a refresh should persist from the one endpoint read. PURE + tested, so the
// 304/skip logic stays out of the I/O orchestration. 'skip' = an ESI error or a
// contract mismatch on a fresh body (keep stored data); 'stamp' = a 304 (bump freshness
// only); 'save' = persist the fresh board.
export type JobsPersistPlan =
  | { kind: 'save'; jobs: IndustryJob[]; etag: string | null }
  | { kind: 'stamp' }
  | { kind: 'skip'; code?: string };

export function planJobsPersist(read: JobsEsiRead): JobsPersistPlan {
  if (read.kind === 'error') return { kind: 'skip', code: read.code };
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  const jobs = parseIndustryJobsBody(read.body);
  if (jobs === null) return { kind: 'skip', code: 'contract_error' };
  return { kind: 'save', jobs, etag: read.etag };
}

// The save payload the engine carries from fetchAndPlan to save (the fresh board).
interface JobsSave {
  jobs: IndustryJob[];
  etag: string | null;
}

function makeDescriptor(port: JobsPort): OwnerSyncDescriptor<number, CharacterJobsSyncState, JobsSave> {
  return makeCharacterDescriptor(port, {
    isStale: isJobsStale,
    eligible: canSyncIndustryJobs,
    fetchAndPlan: async (characterId, accessToken, state) => {
      const read = await port.readJobs(characterId, accessToken, state?.jobsEtag ?? null);
      return planJobsPersist(read);
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

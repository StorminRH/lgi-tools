// The on-view corp industry-jobs refresh (MIGRATE.B.3; engine-backed since
// MIGRATE.D.2). PURE orchestration: refreshCorpJobsForUser builds an
// OwnerSyncDescriptor from the injected port (types.ts) + this slice's pure helpers
// and hands it to the shared per-owner sync engine (src/platform/owner-sync). It imports no
// auth and no DB, so it stays inside the feature boundary and is unit-tested with a
// fake port. The real port is wired in src/composition/sync/corp-industry-jobs-sync.ts.
//
// Corp jobs is the corp-only axis, keyed (userId, corporationId) — boards stay
// per-user/private. The engine checks the staleness gate BEFORE any vend or roles read
// (a fresh corp does zero work), resolves a Director among the member characters, and
// surfaces the graceful needs_role state via saveGateState (the destructive board-drop
// is the slice's saveNeedsRole). The shared corporation descriptor owns the common
// mechanics; this feature alone maps a mid-run ESI 403 to needs_role. The client
// derives "ready" from each job's end_date.
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

// The (user, corp) owner key — corp boards are per-user/private, so the owner carries
// both the viewing user and the corporation.
interface CorpOwner {
  userId: string;
  corporationId: number;
}

// The save payload the engine carries from fetchAndPlan to save (the fresh board).
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
        // A 403 means the role was revoked after token resolution. Corp jobs record
        // the same graceful needs_role state; every other error keeps its code.
        (code) => (code === 'esi_403' ? { kind: 'needs_role' } : { kind: 'skip', code }),
      );
    },
    save: (owner, payload) => port.saveJobs(owner.userId, owner.corporationId, payload.jobs, payload.etag),
    stampFresh: (owner) => port.stampFresh(owner.userId, owner.corporationId),
    saveGateState: (owner) => port.saveNeedsRole(owner.userId, owner.corporationId),
  });
}

/**
 * Refreshes every corporation-industry owner visible to one user and returns the merged stored job
 * projection.
 */
export function refreshCorpJobsForUser(
  port: CorpJobsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId, options);
}

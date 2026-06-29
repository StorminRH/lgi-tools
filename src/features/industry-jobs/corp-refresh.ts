// The on-view corp industry-jobs refresh (MIGRATE.B.3; engine-backed since
// MIGRATE.D.2). PURE orchestration: refreshCorpJobsForUser builds an
// OwnerSyncDescriptor from the injected port (types.ts) + this slice's pure helpers
// and hands it to the shared per-owner sync engine (src/lib/owner-sync). It imports no
// auth and no DB, so it stays inside the feature boundary and is unit-tested with a
// fake port. The real port is wired in src/db/corp-industry-jobs-sync.ts.
//
// Corp jobs is the corp-only axis, keyed (userId, corporationId) — boards stay
// per-user/private. The engine checks the staleness gate BEFORE any vend or roles read
// (a fresh corp does zero work), resolves a Director among the member characters, and
// surfaces the graceful needs_role state via saveGateState (the destructive board-drop
// is the slice's saveNeedsRole). An ESI 403 on the board read (role revoked mid-run)
// maps to the SAME needs_role state via planCorpJobsPersist below; refresh.test.ts pins
// the byte-identical behaviour. The client derives "ready" from each job's end_date.
import { type OwnerSyncDescriptor, runOwnerSync } from '@/lib/owner-sync';
import { CORP_INDUSTRY_JOBS_REQUIRED_ROLES, canSyncCorpIndustryJobs } from './corp-sync-eligibility';
import { type IndustryJob, parseIndustryJobsBody } from './esi-projection';
import { isJobsStale } from './staleness';
import type { CorpJobsPort, CorpJobsSyncState, JobsEsiRead } from './types';

// What a corp refresh should persist from the one endpoint read. PURE + tested, so the
// 304/error logic stays out of the I/O orchestration. 'skip' = a transient error or a
// contract mismatch (keep the stored board, don't stamp → retry next view); 'stamp' =
// a 304 (bump freshness + clear error); 'needs_role' = a 403 (role revoked mid-run →
// the graceful state); 'save' = persist the fresh board.
export type CorpJobsPersistPlan =
  | { kind: 'save'; jobs: IndustryJob[]; etag: string | null }
  | { kind: 'stamp' }
  | { kind: 'needs_role' }
  | { kind: 'skip' };

export function planCorpJobsPersist(read: JobsEsiRead): CorpJobsPersistPlan {
  if (read.kind === 'error') {
    // A 403 means the in-game role check failed server-side (role revoked since
    // resolution) — the same graceful needs_role state, not a transient retry. Every
    // other error keeps the stored board and retries on the next view (no stamp).
    return read.code === 'esi_403' ? { kind: 'needs_role' } : { kind: 'skip' };
  }
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  const jobs = parseIndustryJobsBody(read.body);
  if (jobs === null) return { kind: 'skip' }; // contract mismatch — keep stored board
  return { kind: 'save', jobs, etag: read.etag };
}

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

function makeDescriptor(port: CorpJobsPort): OwnerSyncDescriptor<CorpOwner, CorpJobsSyncState, CorpJobsSave> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listMembers(userId),
    vendToken: (characterId) => port.vendToken(characterId),
    isStale: (state, now) => isJobsStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => canSyncCorpIndustryJobs(owner),
      ownerOf: (userId, corporationId) => ({ userId, corporationId }),
      requiredRoles: CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner.userId, owner.corporationId),
    fetchAndPlan: async (owner, accessToken, state) => {
      const read = await port.readJobs(owner.corporationId, accessToken, state?.jobsEtag ?? null);
      return planCorpJobsPersist(read);
    },
    save: (owner, payload) => port.saveJobs(owner.userId, owner.corporationId, payload.jobs, payload.etag),
    stampFresh: (owner) => port.stampFresh(owner.userId, owner.corporationId),
    saveGateState: (owner) => port.saveNeedsRole(owner.userId, owner.corporationId),
  };
}

export async function refreshCorpJobsForUser(port: CorpJobsPort, userId: string): Promise<void> {
  await runOwnerSync(makeDescriptor(port), userId);
}

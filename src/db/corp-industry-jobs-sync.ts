// Corp industry-jobs composition layer (MIGRATE.B.3). Lives here, above the slices,
// because it is the only point that touches BOTH the auth slice (per-character token
// vend, affiliation/role reads) AND the industry-jobs slice (the ESI→projection + Neon
// storage) — a cross-slice join the feature boundary forbids inside either slice (the
// sde-pipeline.ts pattern). This wires the real corp port the pure refresh runs over,
// and exposes the on-view seam the corp-jobs API route consumes: read the cached
// per-corp boards, fire a stale-gated write-behind refresh behind the response (zero
// added latency). A direct mirror of src/db/industry-jobs-sync.ts, corp-keyed, with the
// Director resolution (vend + roles read) supplied by the shared owner-sync-port.ts
// wiring (MIGRATE.D.2).
import { after } from 'next/server';
import { getTypeNames } from '@/data/eve-data/queries';
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
import { listCharactersWithHealth, readRolesFor, readSingleEndpoint, vendTokenFor } from './owner-sync-port';

// The real corp port: the shared auth + ESI wiring (owner-sync-port.ts) plus this
// slice's own corp-keyed Neon read/save/stamp + the graceful needs_role drop. Corp
// jobs reads one single-page endpoint (readSingleEndpoint) per corporation.
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

// One corp's board for the wire: the cached payload (null when needs_role / un-synced)
// plus the "as of" stamp and the graceful per-corp error state. The client joins this
// with the corp + installer names it resolves via /api/eve/names.
export interface ViewerCorpJobs {
  corporationId: number;
  data: CharacterJobsData | null;
  lastRefreshedAt: number | null;
  syncError: string | null;
}

// The on-view payload: the per-corp boards + one shared type-id→name map (blueprint +
// product names) resolved server-side from the SDE, keyed by String(typeId).
export interface ViewerCorpJobsResult {
  corporations: ViewerCorpJobs[];
  names: Record<string, string>;
}

// The on-view seam: read the user's current corp boards + freshness immediately,
// resolve the referenced type names from the SDE, and fire a stale-gated write-behind
// refresh behind the response. A re-view inside the 300s window makes no ESI call (the
// refresh's per-corp staleness gate is the dedup). The corp set is the user's sync rows
// (the board table is corp-keyed but not user-enumerable on its own); on a first-ever
// view there are no rows yet — the client's cold reconcile re-fetches once the
// write-behind has populated. The cached boards + the uncached sync states are read in
// parallel.
export async function getCorpJobsForUserOnView(userId: string): Promise<ViewerCorpJobsResult> {
  const syncStates = await listCorpJobSyncStates(userId);
  const corporationIds = syncStates.map((state) => state.corporationId);
  const dataMap = await getCorpJobsForUser(userId, corporationIds);
  after(() => refreshCorpJobsForUser(makeCorpJobsPort(), userId));

  const corporations: ViewerCorpJobs[] = syncStates.map((state) => ({
    corporationId: state.corporationId,
    data: dataMap.get(state.corporationId) ?? null,
    lastRefreshedAt: state.lastRefreshedAt?.getTime() ?? null,
    syncError: state.syncError,
  }));

  const nameMap = await getTypeNames([...new Set(jobTypeIds(corporations))]);
  const names: Record<string, string> = {};
  for (const [id, name] of nameMap) names[String(id)] = name;

  return { corporations, names };
}

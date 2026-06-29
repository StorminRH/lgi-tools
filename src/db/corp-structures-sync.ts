// Corp owned-structures composition layer (3.7.9). Lives here, above the slices,
// because it is the only point that touches BOTH the auth slice (per-character token
// vend, affiliation/role reads) AND the owned-structures slice (the ESI→projection +
// Neon storage) — a cross-slice join the feature boundary forbids inside either slice
// (the sde-pipeline.ts pattern). This wires the real corp port the pure refresh runs
// over (entirely from the SHARED owner-sync-port.ts helpers — a descriptor + port
// wiring, NOT a clone), and exposes the on-view seam the corp-structures API route
// consumes: read the member's corps' shared catalogues, fire a stale-gated
// write-behind refresh behind the response (zero added latency). A direct mirror of
// src/db/corp-industry-jobs-sync.ts, with the KEY divergence that the store is keyed
// by corporation ALONE (shared across members), so the read scope comes from the
// viewer's corp membership (the 3.7.3 corp-access gate), not their own sync rows.
import { after } from 'next/server';
import { refreshStaleAffiliationsForUser } from '@/features/auth/affiliation';
import { memberCorpIds } from '@/features/auth/membership';
import { getUserAffiliations } from '@/features/auth/queries';
import {
  getCorpStructures,
  listCorpStructureSyncStates,
  readCorpStructureSyncState,
  saveCorpStructures,
  stampCorpStructuresFresh,
} from '@/features/owned-structures/queries';
import { refreshCorpStructuresForUser } from '@/features/owned-structures/refresh';
import type { CorpStructureRow, CorpStructuresPort } from '@/features/owned-structures/types';
import { listCharactersWithHealth, readPagedEndpoint, readRolesFor, vendTokenFor } from './owner-sync-port';

// The real corp port: the shared auth + ESI wiring (owner-sync-port.ts) plus this
// slice's own corp-keyed Neon read/save/stamp. Corp structures reads ONE paged
// endpoint (readPagedEndpoint) per corporation. Note there is no saveNeedsRole: the
// store is shared, so a role-less member never drops it (the refresh omits the gate
// state — see owned-structures/refresh.ts).
function makeCorpStructuresPort(): CorpStructuresPort {
  return {
    now: () => new Date(),
    listMembers: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesFor,
    readStructures: (corporationId, accessToken, heldEtags) =>
      readPagedEndpoint(`/corporations/${corporationId}/structures/`, accessToken, heldEtags),
    readSyncState: (corporationId) => readCorpStructureSyncState(corporationId),
    saveStructures: (corporationId, rows, etags) => saveCorpStructures(corporationId, rows, etags),
    stampFresh: (corporationId) => stampCorpStructuresFresh(corporationId),
  };
}

// One corp's structures for the wire: the shared catalogue + the "as of" stamp.
export interface ViewerCorpStructures {
  corporationId: number;
  structures: CorpStructureRow[];
  lastRefreshedAt: number | null;
}

// The on-view payload: the per-corp structure catalogues for every corp the viewer
// is a member of.
export interface ViewerCorpStructuresResult {
  corporations: ViewerCorpStructures[];
}

// The on-view seam: scope the read to the corps the viewer is a CURRENT member of
// (refresh stale affiliations first, then the fail-closed membership set — the 3.7.3
// gate's refresh-then-decide), read those corps' shared catalogues + freshness, and
// fire a stale-gated write-behind refresh behind the response. Because the staleness
// stamp lives on the shared corp row, the FIRST member's view per window does the ESI
// work and every other member's view inside the window makes no ESI call (the
// refresh's per-corp staleness gate is the dedup). A non-member's affiliation set
// never includes the corp, so they read nothing.
export async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const corporationIds = memberCorpIds(affiliations, new Date());
  const [structuresByCorp, syncStates] = await Promise.all([
    getCorpStructures(corporationIds),
    listCorpStructureSyncStates(corporationIds),
  ]);
  after(() => refreshCorpStructuresForUser(makeCorpStructuresPort(), userId));

  const freshnessByCorp = new Map(syncStates.map((s) => [s.corporationId, s.lastRefreshedAt.getTime()]));
  const corporations: ViewerCorpStructures[] = corporationIds.map((corporationId) => ({
    corporationId,
    structures: structuresByCorp.get(corporationId) ?? [],
    lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
  }));

  return { corporations };
}

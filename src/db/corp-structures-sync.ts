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
import { decideCorpAccess } from '@/features/auth/corp-access';
import { memberCharacterIdsInCorp, memberCorpIds } from '@/features/auth/membership';
import { getUserAffiliations } from '@/features/auth/affiliation-store';
import {
  getCorpStructureRigs,
  getCorpStructures,
  isCorpStructureSharingEnabled,
  listCorpStructureSyncStates,
  readCorpStructureSharings,
  readCorpStructureSyncState,
  saveCorpStructures,
  stampCorpStructuresFresh,
} from '@/features/owned-structures/queries';
import { CORP_STRUCTURES_REQUIRED_ROLES } from '@/features/owned-structures/corp-sync-eligibility';
import { refreshCorpStructuresForUser } from '@/features/owned-structures/refresh';
import type {
  CorpStructurePageView,
  CorpStructureRow,
  CorpStructuresPort,
} from '@/features/owned-structures/types';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import type { SecurityClass } from '@/data/eve-data/security';
import { listCharactersWithHealth, readPagedEndpoint, readRolesFor, vendTokenFor } from './owner-sync-port';

// The real corp port: the shared auth + ESI wiring (owner-sync-port.ts) plus this
// slice's own corp-keyed Neon read/save/stamp. Corp structures reads ONE paged
// endpoint (readPagedEndpoint) per corporation. Note there is no saveNeedsRole: the
// store is shared, so a role-less member never drops it (the refresh omits the gate
// state — see owned-structures/refresh.ts).
function makeCorpStructuresPort(): CorpStructuresPort {
  return {
    now: () => new Date(),
    isSharingEnabled: isCorpStructureSharingEnabled,
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

/** One corp's structures for the wire: the shared catalogue + the "as of" stamp. */
export interface ViewerCorpStructures {
  corporationId: number;
  structures: CorpStructureRow[];
  lastRefreshedAt: number | null;
}

/**
 * The on-view payload: the per-corp structure catalogues for every corp the viewer
 * is a member of.
 */
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
// Fire the stale-gated write-behind refresh for the user's corps behind the
// response — shared by both on-view reads.
function scheduleCorpStructuresRefresh(userId: string): void {
  after(() => refreshCorpStructuresForUser(makeCorpStructuresPort(), userId));
}

// Each corp's last-refreshed epoch ms, keyed by corp id, for the freshness readout.
function freshnessMapOf(
  syncStates: { corporationId: number; lastRefreshedAt: Date }[],
): Map<number, number> {
  return new Map(syncStates.map((s) => [s.corporationId, s.lastRefreshedAt.getTime()]));
}

export async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const corporationIds = memberCorpIds(affiliations, new Date());
  const [structuresByCorp, syncStates, sharings] = await Promise.all([
    getCorpStructures(corporationIds),
    listCorpStructureSyncStates(corporationIds),
    readCorpStructureSharings(corporationIds),
  ]);
  scheduleCorpStructuresRefresh(userId);

  // Fail reads closed on consent (defense in depth): a corp that hasn't opted in
  // returns no structures even if a row survived a partial wipe — so this seam (and
  // the planner merge that reuses it) never exposes a disabled corp's catalogue.
  const freshnessByCorp = freshnessMapOf(syncStates);
  const corporations: ViewerCorpStructures[] = corporationIds.map((corporationId) => ({
    corporationId,
    structures: sharings.get(corporationId)?.enabled ? structuresByCorp.get(corporationId) ?? [] : [],
    lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
  }));

  return { corporations };
}

/**
 * One corp-pulled structure flattened for the planner's build-location selector: the
 * stored row joined with the structure-manager's authored completion (rig fit, empty
 * when none; facility tax, null when never entered → the fee path assumes the 0.25%
 * NPC baseline).
 */
export interface AvailableCorpStructure {
  structureId: number;
  typeId: number;
  systemId: number;
  securityClass: SecurityClass;
  name: string | null;
  rigTypeIds: number[];
  taxPct: number | null;
}

/**
 * The corp-pulled structures the user may build in, flattened across their member
 * corps and joined with the authored rigs — the corp half of GET /api/account/structures.
 * Reuses the on-view seam (membership scoping + the sharing read-filter + the
 * write-behind refresh), so only sharing-enabled corps contribute and a disabled
 * corp's structures never appear. Anonymous / no-member users get an empty list.
 */
export async function getAvailableCorpStructuresForUser(userId: string): Promise<AvailableCorpStructure[]> {
  const { corporations } = await getCorpStructuresForUserOnView(userId);
  const rigsByStructure = await getCorpStructureRigs(corporations.map((c) => c.corporationId));
  const out: AvailableCorpStructure[] = [];
  for (const corp of corporations) {
    for (const s of corp.structures) {
      const completion = rigsByStructure.get(s.structureId);
      out.push({
        structureId: s.structureId,
        typeId: s.typeId,
        systemId: s.systemId,
        securityClass: s.securityClass,
        name: s.name,
        rigTypeIds: completion?.rigTypeIds ?? [],
        taxPct: completion?.taxPct ?? null,
      });
    }
  }
  return out;
}

/**
 * The structures page's corp section, server-resolved (the CorpStructurePageView
 * shape lives in the owned-structures slice so the client section shares it). Unlike
 * the planner read, this lists ALL member corps (a Station_Manager must see a disabled
 * corp to enable it). Refreshes affiliations + fires
 * the same stale-gated write-behind the planner does, then assembles per member corp:
 * the resolved name, the viewer's Station_Manager flag (one ESI roles read per corp —
 * acceptable for this low-traffic settings page; the mutation re-checks authoritatively),
 * the sharing state, and (when enabled) the shared structures joined with authored rigs.
 */
export async function getCorpStructuresPageData(userId: string): Promise<CorpStructurePageView[]> {
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const corporationIds = memberCorpIds(affiliations, new Date());
  if (corporationIds.length === 0) return [];

  const [structuresByCorp, syncStates, sharings, rigsByStructure, names] = await Promise.all([
    getCorpStructures(corporationIds),
    listCorpStructureSyncStates(corporationIds),
    readCorpStructureSharings(corporationIds),
    getCorpStructureRigs(corporationIds),
    resolveEntityNames(corporationIds),
  ]);
  scheduleCorpStructuresRefresh(userId);

  const freshnessByCorp = freshnessMapOf(syncStates);
  const smFlags = await Promise.all(
    corporationIds.map(
      async (corporationId) =>
        [corporationId, await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES)] as const,
    ),
  );
  const isStationManagerByCorp = new Map(smFlags);

  return corporationIds.map((corporationId) => {
    const sharingEnabled = sharings.get(corporationId)?.enabled ?? false;
    const rows = sharingEnabled ? structuresByCorp.get(corporationId) ?? [] : [];
    return {
      corporationId,
      corporationName: names[String(corporationId)] ?? `Corporation ${corporationId}`,
      isStationManager: isStationManagerByCorp.get(corporationId) ?? false,
      sharingEnabled,
      structures: rows.map((s) => ({
        ...s,
        rigTypeIds: rigsByStructure.get(s.structureId)?.rigTypeIds ?? [],
        taxPct: rigsByStructure.get(s.structureId)?.taxPct ?? null,
      })),
      lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
    };
  });
}

/**
 * Whether the user holds one of `requiredRoles` in the corp via ANY of their linked
 * pilots in it — the Station_Manager gate on the sharing + rig-completion mutations.
 * Composes the auth membership set (which pilots are in the corp) with the ESI roles
 * read (the same vend + readRoles the sync engine's Director resolution uses), so it
 * belongs here in the composition layer, not in either feature slice. Assumes the
 * caller already refreshed affiliations (decideCorpAccess does); reads the fresh set.
 * Returns true on the FIRST in-corp pilot that holds the role; a pilot whose token
 * can't be vended or whose roles can't be read simply doesn't contribute.
 */
export async function userHoldsCorpRole(
  userId: string,
  corporationId: number,
  requiredRoles: readonly string[],
): Promise<boolean> {
  const affiliations = await getUserAffiliations(userId);
  const memberCharacterIds = memberCharacterIdsInCorp(affiliations, corporationId, new Date());
  for (const characterId of memberCharacterIds) {
    const accessToken = await vendTokenFor(characterId);
    if (accessToken === null) continue;
    const roles = await readRolesFor(characterId, accessToken);
    if (roles !== null && requiredRoles.some((role) => roles.includes(role))) return true;
  }
  return false;
}

/**
 * The two-step Station_Manager gate shared by the corp-structure mutation routes
 * (sharing toggle + the rig/tax completion): membership first (decideCorpAccess —
 * fail-closed + audited; also refreshes affiliations), then the in-game role on
 * the freshly refreshed set. Returns the 403 Response to send, or null when the
 * caller may proceed. Lives here beside userHoldsCorpRole because it composes the
 * auth slice's access decision with this layer's role read — the same cross-slice
 * join reason the rest of the file exists.
 */
export async function stationManagerGate(
  userId: string,
  corporationId: number,
): Promise<Response | null> {
  const access = await decideCorpAccess({ userId, corporationId });
  if (!access.allowed) return new Response('Not a member of this corporation', { status: 403 });
  if (!(await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
    return new Response('Requires the Station Manager role', { status: 403 });
  }
  return null;
}

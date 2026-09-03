import { after, connection } from 'next/server';
import { refreshStaleAffiliationsForUser } from '@/platform/auth/affiliation';
import { decideCorpAccess } from '@/platform/auth/corp-access';
import { memberCharacterIdsInCorp, memberCorpIds } from '@/platform/auth/membership';
import { getUserAffiliations } from '@/platform/auth/affiliation-store';
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
import { forbiddenFailure, type AppFailure } from '@/lib/failure';
import { listCharactersWithHealth, readPagedEndpoint, readRolesFor, vendTokenFor } from './owner-sync-port';

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

export interface ViewerCorpStructures {
  corporationId: number;
  structures: CorpStructureRow[];
  lastRefreshedAt: number | null;
}

export interface ViewerCorpStructuresResult {
  corporations: ViewerCorpStructures[];
}

function scheduleCorpStructuresRefresh(userId: string): void {
  after(() => refreshCorpStructuresForUser(makeCorpStructuresPort(), userId));
}

// headers() still resolves during the session App Shell. Affiliation ESI must
// wait for a real request so Next does not abort the fetch at prerender end.
async function loadFreshUserAffiliations(userId: string) {
  await connection();
  await refreshStaleAffiliationsForUser(userId);
  return getUserAffiliations(userId);
}

function freshnessMapOf(
  syncStates: { corporationId: number; lastRefreshedAt: Date }[],
): Map<number, number> {
  return new Map(syncStates.map((s) => [s.corporationId, s.lastRefreshedAt.getTime()]));
}

export async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  const affiliations = await loadFreshUserAffiliations(userId);
  const corporationIds = memberCorpIds(affiliations, new Date());
  const [structuresByCorp, syncStates, sharings] = await Promise.all([
    getCorpStructures(corporationIds),
    listCorpStructureSyncStates(corporationIds),
    readCorpStructureSharings(corporationIds),
  ]);
  scheduleCorpStructuresRefresh(userId);

  const freshnessByCorp = freshnessMapOf(syncStates);
  const corporations: ViewerCorpStructures[] = corporationIds.map((corporationId) => ({
    corporationId,
    structures: sharings.get(corporationId)?.enabled ? structuresByCorp.get(corporationId) ?? [] : [],
    lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
  }));

  return { corporations };
}

export interface AvailableCorpStructure {
  structureId: number;
  typeId: number;
  systemId: number;
  securityClass: SecurityClass;
  name: string | null;
  rigTypeIds: number[];
  taxPct: number | null;
}

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
  const affiliations = await loadFreshUserAffiliations(userId);
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
async function userHoldsCorpRole(
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

export async function stationManagerGate(
  userId: string,
  corporationId: number,
): Promise<{ ok: true } | { ok: false; failure: AppFailure }> {
  const access = await decideCorpAccess({ userId, corporationId });
  if (!access.allowed) {
    return {
      ok: false,
      failure: forbiddenFailure('not_corp_member', 'Not a member of this corporation'),
    };
  }
  if (!(await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
    return {
      ok: false,
      failure: forbiddenFailure(
        'not_station_manager',
        'Requires the Station Manager role',
      ),
    };
  }
  return { ok: true };
}

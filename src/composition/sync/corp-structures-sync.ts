import { after, connection } from 'next/server';
import { resolveUserCorpAccess } from '@/composition/corp-access';
import { authorizeCorpMutation, type UserCorpAccess } from '@/platform/auth/corp-access';
import { selectCorpCredential } from '@/platform/owner-sync';
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

async function loadUserCorpAccess(userId: string) {
  await connection();
  return resolveUserCorpAccess(userId);
}

function freshnessMapOf(
  syncStates: { corporationId: number; lastRefreshedAt: Date }[],
): Map<number, number> {
  return new Map(syncStates.map((s) => [s.corporationId, s.lastRefreshedAt.getTime()]));
}

export async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  const access = await loadUserCorpAccess(userId);
  const corporationIds = [...access.corporationIds];
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
  const access = await loadUserCorpAccess(userId);
  const corporationIds = [...access.corporationIds];
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
        [corporationId, await userHoldsCorpRole(access, corporationId, CORP_STRUCTURES_REQUIRED_ROLES)] as const,
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

async function userHoldsCorpRole(
  access: UserCorpAccess,
  corporationId: number,
  requiredRoles: readonly string[],
): Promise<boolean> {
  const selection = await selectCorpCredential(
    access.characterIdsByCorporation[corporationId] ?? [],
    requiredRoles,
    { vendToken: vendTokenFor, readRoles: readRolesFor },
  );
  return selection.kind === 'sufficient';
}

export async function stationManagerGate(
  userId: string,
  corporationId: number,
): Promise<{ ok: true } | { ok: false; failure: AppFailure }> {
  const access = await resolveUserCorpAccess(userId);
  const decision = await authorizeCorpMutation(access, corporationId);
  if (!decision.allowed) {
    return {
      ok: false,
      failure: forbiddenFailure('not_corp_member', 'Not a member of this corporation'),
    };
  }
  if (!(await userHoldsCorpRole(access, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
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

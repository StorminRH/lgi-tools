import { after, connection } from 'next/server';
import { resolveUserCorpAccess } from '@/composition/corp-access';
import { type CorpViewer, resolveCorpViewer } from '@/composition/corp-viewer';
import { authorizeCorpMutation, type UserCorpAccess } from '@/platform/auth/corp-access';
import type { StructuresAccess } from '@/platform/auth/corp-visibility';
import { selectCorpCredential } from '@/platform/owner-sync';
import {
  type CorpStructureCompletion,
  getCorpStructureRigs,
  getCorpStructures,
  listCorpStructureSyncStates,
  readCorpStructureSyncState,
  saveCorpStructures,
  stampCorpStructuresFresh,
} from '@/features/owned-structures/queries';
import { CORP_STRUCTURES_REQUIRED_ROLES } from '@/features/owned-structures/corp-sync-eligibility';
import { refreshCorpStructuresForUser } from '@/features/owned-structures/refresh';
import type {
  CorpStructurePageStructure,
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

async function loadCorpViewer(userId: string): Promise<CorpViewer> {
  await connection();
  return resolveCorpViewer(userId);
}

async function loadFreshness(corporationIds: number[]): Promise<Map<number, number>> {
  const syncStates = await listCorpStructureSyncStates(corporationIds);
  return new Map(syncStates.map((s) => [s.corporationId, s.lastRefreshedAt.getTime()]));
}

function visibleStructures(access: StructuresAccess, rows: CorpStructureRow[] | undefined): CorpStructureRow[] {
  return access === 'none' ? [] : rows ?? [];
}

export async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  const { corporations } = await loadCorpViewer(userId);
  const corporationIds = corporations.map((corp) => corp.corporationId);
  const [structuresByCorp, freshnessByCorp] = await Promise.all([
    getCorpStructures(corporationIds),
    loadFreshness(corporationIds),
  ]);
  scheduleCorpStructuresRefresh(userId);

  return {
    corporations: corporations.map(({ corporationId, grant }) => ({
      corporationId,
      structures: visibleStructures(grant.structures, structuresByCorp.get(corporationId)),
      lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
    })),
  };
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

function withCompletion(
  structure: CorpStructureRow,
  rigsByStructure: ReadonlyMap<number, CorpStructureCompletion>,
): CorpStructurePageStructure {
  const completion = rigsByStructure.get(structure.structureId);
  return { ...structure, rigTypeIds: completion?.rigTypeIds ?? [], taxPct: completion?.taxPct ?? null };
}

/**
 * Every member corp for the structures page and the corporation settings
 * page, each with the viewer's grant: the roster and rig editor need
 * 'manage', the sharing switch needs a Director. Grants come from stored
 * roles; the mutations re-check live.
 */
export async function getCorpStructuresPageData(userId: string): Promise<CorpStructurePageView[]> {
  const { corporations } = await loadCorpViewer(userId);
  const corporationIds = corporations.map((corp) => corp.corporationId);
  if (corporationIds.length === 0) return [];

  const [structuresByCorp, freshnessByCorp, rigsByStructure, names] = await Promise.all([
    getCorpStructures(corporationIds),
    loadFreshness(corporationIds),
    getCorpStructureRigs(corporationIds),
    resolveEntityNames(corporationIds),
  ]);
  scheduleCorpStructuresRefresh(userId);

  return corporations.map(({ corporationId, sharing, grant }) => ({
    corporationId,
    corporationName: names[String(corporationId)] ?? `Corporation ${corporationId}`,
    structureAccess: grant.structures,
    canManageSharing: grant.manageSharing,
    sharing,
    structures: visibleStructures(grant.structures, structuresByCorp.get(corporationId)).map((s) =>
      withCompletion(s, rigsByStructure),
    ),
    lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
  }));
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

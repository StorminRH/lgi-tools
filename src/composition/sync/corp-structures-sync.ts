import { after, connection } from 'next/server';
import { type CorpViewer, readCorpViewer, resolveCorpViewer } from '@/composition/corp-viewer';
import { withCorpContextDueKeys } from '@/data/corp-holdings/context-sync';
import { isDueFor, recordRefusalFor } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { corpStructuresDueKeys, corpStructuresKey } from '@/features/owned-structures/keys';
import type { StructuresAccess } from '@/platform/auth/corp-visibility';
import {
  type CorpStructureCompletion,
  getCorpStructureRigs,
  getCorpStructures,
  listCorpStructureSyncStates,
  readCorpStructureSyncState,
  saveCorpStructures,
  stampCorpStructuresFresh,
} from '@/features/owned-structures/queries';
import { refreshCorpStructuresForUser } from '@/features/owned-structures/refresh';
import type {
  CorpStructurePageStructure,
  CorpStructurePageView,
  CorpStructuresPageResult,
  CorpStructureRow,
  CorpStructuresPort,
} from '@/features/owned-structures/types';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import type { SecurityClass } from '@/data/eve-data/security';
import { nameOrUnresolved } from '@/lib/format/names';
import { singleFlight } from '@/lib/memoize';
import { refreshDue } from './live-dataset-view';
import { listCharactersWithHealth, readRolesForSync, vendTokenFor } from './owner-sync-port';

/** The port of one user's pass: the corporation answer is shared, but a due check and a refusal are this user's. */
function makeCorpStructuresPort(userId: string): CorpStructuresPort {
  return {
    now: () => new Date(),
    listMembers: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    isDue: (corporationId) => isDueFor(userId, [corpStructuresKey(corporationId)]),
    openSession: openReadSession,
    readStructures: (session, corporationId, accessToken) => session.readPaged(corpStructuresKey(corporationId), accessToken),
    readSyncState: (corporationId) => readCorpStructureSyncState(corporationId),
    saveStructures: (corporationId, rows, etags, tx) => saveCorpStructures(corporationId, rows, etags, tx),
    stampFresh: (corporationId) => stampCorpStructuresFresh(corporationId),
    recordRefusal: (corporationId, expiresAt) => recordRefusalFor(userId, [corpStructuresKey(corporationId)], expiresAt),
  };
}

/** The structures refresh a route read schedules: concurrent calls for one user in this process share one run, and a call after it settles runs again. */
const refreshCorpStructuresOnView = singleFlight((userId: string) =>
  refreshCorpStructuresForUser(makeCorpStructuresPort(userId), userId));

interface ViewerCorpStructures {
  corporationId: number;
  structures: CorpStructureRow[];
  lastRefreshedAt: number | null;
}

interface ViewerCorpStructuresResult {
  corporations: ViewerCorpStructures[];
  refreshing: boolean;
}

/** Schedules the refresh, and says whether it, or the corp context refresh resolveCorpViewer scheduled, will reach ESI. */
function scheduleCorpStructuresRefresh(userId: string): Promise<boolean> {
  after(() => refreshCorpStructuresOnView(userId));
  return refreshDue(userId, withCorpContextDueKeys(corpStructuresDueKeys));
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

async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  const { corporations } = await loadCorpViewer(userId);
  const corporationIds = corporations.map((corp) => corp.corporationId);
  const [structuresByCorp, freshnessByCorp, refreshing] = await Promise.all([
    getCorpStructures(corporationIds),
    loadFreshness(corporationIds),
    scheduleCorpStructuresRefresh(userId),
  ]);

  return {
    corporations: corporations.map(({ corporationId, grant }) => ({
      corporationId,
      structures: visibleStructures(grant.structures, structuresByCorp.get(corporationId)),
      lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
    })),
    refreshing,
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

export async function getAvailableCorpStructuresForUser(
  userId: string,
): Promise<{ structures: AvailableCorpStructure[]; refreshing: boolean }> {
  const { corporations, refreshing } = await getCorpStructuresForUserOnView(userId);
  const rigsByStructure = await getCorpStructureRigs(corporations.map((c) => c.corporationId));
  const structures: AvailableCorpStructure[] = [];
  for (const corp of corporations) {
    for (const s of corp.structures) {
      const completion = rigsByStructure.get(s.structureId);
      structures.push({
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
  return { structures, refreshing };
}

function withCompletion(
  structure: CorpStructureRow,
  rigsByStructure: ReadonlyMap<number, CorpStructureCompletion>,
): CorpStructurePageStructure {
  const completion = rigsByStructure.get(structure.structureId);
  return { ...structure, rigTypeIds: completion?.rigTypeIds ?? [], taxPct: completion?.taxPct ?? null };
}

/** Says, without scheduling anything, that no refresh will reach ESI. */
const NO_REFRESH = (): Promise<boolean> => Promise.resolve(false);

/**
 * Every member corp for the structures page and the corporation settings
 * page, each with the viewer's grant: the roster and rig editor need
 * 'manage', the sharing switch needs a Director. Grants come from stored
 * roles; the mutations re-check live. `refresh` runs only when there is a
 * corp to refresh, and says whether its refresh will reach ESI.
 */
async function buildCorpStructuresPage(
  { corporations }: CorpViewer,
  refresh: () => Promise<boolean>,
): Promise<CorpStructuresPageResult> {
  const corporationIds = corporations.map((corp) => corp.corporationId);
  if (corporationIds.length === 0) return { corporations: [], refreshing: false };

  const [structuresByCorp, freshnessByCorp, rigsByStructure, names, refreshing] = await Promise.all([
    getCorpStructures(corporationIds),
    loadFreshness(corporationIds),
    getCorpStructureRigs(corporationIds),
    resolveEntityNames(corporationIds),
    refresh(),
  ]);

  const rows: CorpStructurePageView[] = corporations.map(({ corporationId, sharing, grant }) => ({
    corporationId,
    corporationName: nameOrUnresolved(names, corporationId, 'corporation'),
    structureAccess: grant.structures,
    canManageSharing: grant.manageSharing,
    sharing,
    structures: visibleStructures(grant.structures, structuresByCorp.get(corporationId)).map((s) =>
      withCompletion(s, rigsByStructure),
    ),
    lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
  }));
  return { corporations: rows, refreshing };
}

/**
 * The structures page data for the live read's route handler, with the corp
 * context and corp structures refreshed behind the response: both clear
 * cache tags, which revalidateTag allows in a route handler.
 */
export async function getCorpStructuresPageData(userId: string): Promise<CorpStructuresPageResult> {
  return buildCorpStructuresPage(await loadCorpViewer(userId), () => scheduleCorpStructuresRefresh(userId));
}

/**
 * The same data for a page render's first draw. It schedules no refresh,
 * since revalidateTag is unsupported during a render; the page's live read
 * (useCorpStructuresLive) reaches the route handler on mount, which does.
 */
export async function getCorpStructuresFirstDraw(userId: string): Promise<CorpStructuresPageResult> {
  await connection();
  return buildCorpStructuresPage(await readCorpViewer(userId), NO_REFRESH);
}

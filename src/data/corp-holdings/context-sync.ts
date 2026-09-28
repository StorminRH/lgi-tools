import { chunk } from '@/lib/array';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import {
  type EnumeratedOwner,
  makeCorpDescriptor,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
  type PersistVerdict,
  runOwnerSync,
} from '@/platform/owner-sync';
import type { CorpProfile, MemberBase } from './context';
import {
  mergeNames,
  parseAssetNamesBody,
  parseCorporationBody,
  parseDivisionsBody,
  parseMemberTrackingBody,
  parseStructureBody,
  unnamedContainerIds,
  unnamedStructureIds,
} from './context-projection';
import type { CorpHoldingContext } from './placement';

/**
 * Pinned ⊂ EVE_SCOPES by src/composition/sync/corp-context-sync.test.ts (data
 * cannot import EVE_SCOPES). The roles read shares the corp probes' scope; the
 * assets scope covers POST assets/names; read_structures names Upwell roots.
 */
export const CORP_CONTEXT_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_divisions.v1',
  'esi-corporations.track_members.v1',
  'esi-assets.read_corporation_assets.v1',
  'esi-universe.read_structures.v1',
] as const;

export const CORP_CONTEXT_REQUIRED_ROLES = ['Director'] as const;

const CONTEXT_FRESHNESS = freshnessGate('corp_context');
const NAMES_BATCH = 1000;

/** A Director who has not reconnected for the new scopes is not eligible; the profile then stays unknown. */
export function canSyncCorpContext(character: { hasRefreshToken: boolean; missingScopes: string[] }): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_CONTEXT_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}

export type CorpContextRead =
  | { kind: 'fresh'; body: unknown }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/** The injected I/O the Director context pass runs over; wired in src/composition/sync/corp-context-sync.ts. */
export interface CorpContextPort {
  now(): Date;
  listMembers(userId: string): Promise<EnumeratedOwner[]>;
  vendToken(characterId: number): Promise<string | null>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  readCorporation(corporationId: number, accessToken: string): Promise<CorpContextRead>;
  readDivisions(corporationId: number, accessToken: string): Promise<CorpContextRead>;
  readMemberTracking(corporationId: number, accessToken: string): Promise<CorpContextRead>;
  readAssetNames(corporationId: number, accessToken: string, itemIds: readonly number[]): Promise<CorpContextRead>;
  readStructure(structureId: number, accessToken: string): Promise<CorpContextRead>;
  currentContext(corporationId: number): Promise<CorpHoldingContext>;
  listLinkedMemberIds(corporationId: number): Promise<number[]>;
  readProfileState(corporationId: number): Promise<{ lastRefreshedAt: Date } | null>;
  saveProfile(
    corporationId: number,
    profile: CorpProfile,
    bases: readonly MemberBase[],
    refreshedAt: Date,
  ): Promise<void>;
  stampFresh(corporationId: number, refreshedAt: Date): Promise<void>;
}

interface CorpOwner {
  corporationId: number;
}

interface CorpContextState {
  lastRefreshedAt: Date | null;
}

interface CorpContextSave {
  profile: CorpProfile;
  bases: MemberBase[];
}

type Step<T> = { kind: 'ok'; value: T } | { kind: 'skip'; code: string };

function parsed<T>(read: CorpContextRead, parse: (body: unknown) => T | null): Step<T> {
  if (read.kind === 'error') return { kind: 'skip', code: read.code };
  if (read.kind === 'unchanged') return { kind: 'skip', code: 'esi_unexpected_not_modified' };
  const value = parse(read.body);
  return value === null ? { kind: 'skip', code: 'contract_error' } : { kind: 'ok', value };
}

async function readContainerNames(
  port: CorpContextPort,
  corporationId: number,
  accessToken: string,
  itemIds: number[],
): Promise<Step<Record<string, string>>> {
  const names: Record<string, string> = {};
  for (const batch of chunk(itemIds, NAMES_BATCH)) {
    const step = parsed(await port.readAssetNames(corporationId, accessToken, batch), parseAssetNamesBody);
    if (step.kind === 'skip') return step;
    Object.assign(names, step.value);
  }
  return { kind: 'ok', value: names };
}

/** Best effort: a Director off a structure's docking list gets a 403, and that name stays unknown. */
async function readStructureNames(
  port: CorpContextPort,
  accessToken: string,
  structureIds: number[],
): Promise<Record<string, string>> {
  const reads = await Promise.all(
    structureIds.map(async (id) => [id, parsed(await port.readStructure(id, accessToken), parseStructureBody)] as const),
  );
  const names: Record<string, string> = {};
  for (const [id, step] of reads) if (step.kind === 'ok') names[String(id)] = step.value;
  return names;
}

/**
 * Names are incremental: only containers and structure roots the current
 * index refers to and the stored profile has not named yet are requested, so a
 * pass costs a handful of calls after the first. Any required read that fails
 * skips the pass and keeps the prior profile whole.
 */
async function planContext(
  port: CorpContextPort,
  owner: CorpOwner,
  accessToken: string,
): Promise<PersistVerdict<CorpContextSave>> {
  const { corporationId } = owner;
  const [corporation, divisions, tracking, linked, context] = await Promise.all([
    port.readCorporation(corporationId, accessToken),
    port.readDivisions(corporationId, accessToken),
    port.readMemberTracking(corporationId, accessToken),
    port.listLinkedMemberIds(corporationId),
    port.currentContext(corporationId),
  ]);
  const hq = parsed(corporation, parseCorporationBody);
  if (hq.kind === 'skip') return hq;
  const divisionNames = parsed(divisions, parseDivisionsBody);
  if (divisionNames.kind === 'skip') return divisionNames;
  const bases = parsed(tracking, (body) => parseMemberTrackingBody(body, new Set(linked)));
  if (bases.kind === 'skip') return bases;
  const containerIds = unnamedContainerIds(context.index, context.containerNames);
  const containerNames = await readContainerNames(port, corporationId, accessToken, containerIds);
  if (containerNames.kind === 'skip') return containerNames;
  const structureIds = unnamedStructureIds(context.index, context.structureNames);
  const structureNames = await readStructureNames(port, accessToken, structureIds);
  return {
    kind: 'save',
    profile: {
      hqStationId: hq.value.hqStationId,
      divisionNames: divisionNames.value,
      containerNames: mergeNames(context.containerNames, containerNames.value),
      structureNames: mergeNames(context.structureNames, structureNames),
      pageEtags: [],
    },
    bases: bases.value,
  };
}

function makeDescriptor(port: CorpContextPort) {
  return makeCorpDescriptor<CorpOwner, CorpContextState, CorpContextSave>(port, {
    ownerOf: (_userId, corporationId) => ({ corporationId }),
    eligible: canSyncCorpContext,
    requiredRoles: CORP_CONTEXT_REQUIRED_ROLES,
    isStale: CONTEXT_FRESHNESS.isStale,
    readState: (owner) => port.readProfileState(owner.corporationId),
    fetchAndPlan: (owner, accessToken) => planContext(port, owner, accessToken),
    save: (owner, payload) => port.saveProfile(owner.corporationId, payload.profile, payload.bases, port.now()),
    stampFresh: (owner) => port.stampFresh(owner.corporationId, port.now()),
  });
}

export function refreshCorpContextForUser(
  port: CorpContextPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId, options);
}

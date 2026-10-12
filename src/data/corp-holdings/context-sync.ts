import type { EveScope } from '@/config/eve-scopes';
import type { EsiReadSession } from '@/data/esi-store/session';
import { chunk } from '@/lib/array';
import { HOUR_MS } from '@/lib/iso-date';
import { scopeEligibility } from '@/lib/scope-eligibility';
import {
  type CorpSyncBase,
  errorVerdict,
  makeCorpDescriptor,
  type OwnerSyncResult,
  type PersistVerdict,
  runOwnerSync,
  type SingleOwnerRead,
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

const CORP_CONTEXT_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_divisions.v1',
  'esi-corporations.track_members.v1',
  'esi-assets.read_corporation_assets.v1',
  'esi-universe.read_structures.v1',
] as const satisfies readonly EveScope[];

const CORP_CONTEXT_REQUIRED_ROLES = ['Director'] as const;

const NAMES_BATCH = 1000;
const STRUCTURE_NAME_READS_PER_PASS = 10;

export interface CorpContextPort extends CorpSyncBase<EsiReadSession> {
  isDue(corporationId: number): Promise<boolean>;
  readCorporation(session: EsiReadSession, corporationId: number, accessToken: string): Promise<SingleOwnerRead>;
  readDivisions(session: EsiReadSession, corporationId: number, accessToken: string): Promise<SingleOwnerRead>;
  readMemberTracking(session: EsiReadSession, corporationId: number, accessToken: string): Promise<SingleOwnerRead>;
  readAssetNames(
    session: EsiReadSession,
    corporationId: number,
    accessToken: string,
    itemIds: readonly number[],
  ): Promise<SingleOwnerRead>;
  readStructure(session: EsiReadSession, structureId: number, accessToken: string): Promise<SingleOwnerRead>;
  currentContext(corporationId: number): Promise<CorpHoldingContext>;
  listLinkedMemberIds(corporationId: number): Promise<number[]>;
  readProfileState(corporationId: number): Promise<{ lastRefreshedAt: Date } | null>;
  /** Null bases leave the stored member bases as they are: the tracking answer was unchanged. */
  saveProfile(
    corporationId: number,
    profile: CorpProfile,
    bases: readonly MemberBase[] | null,
    refreshedAt: Date,
  ): Promise<void>;
  stampFresh(corporationId: number, refreshedAt: Date): Promise<void>;
  /** Records the syncing user's settled refusal (no role-holder among their characters) for the corporation, until `expiresAt` or the route's spec cache time. */
  recordRefusal(corporationId: number, expiresAt: number | null): Promise<void>;
}

interface CorpOwner {
  corporationId: number;
}

interface CorpContextState {
  lastRefreshedAt: Date | null;
}

interface CorpContextSave {
  profile: CorpProfile;
  bases: MemberBase[] | null;
}

type Step<T> = { kind: 'ok'; value: T } | { kind: 'unchanged' } | { kind: 'skip'; code: string; expiresAt?: number };

/** A read's parsed body; the error codes are the engine's (a 403 becomes `needs_role`) and an unchanged answer carries nothing. */
function parsed<T>(read: SingleOwnerRead, parse: (body: unknown) => T | null): Step<T> {
  if (read.kind === 'error') return { kind: 'skip', code: read.code, expiresAt: read.expiresAt };
  if (read.kind === 'unchanged') return { kind: 'unchanged' };
  const value = parse(read.body);
  return value === null ? { kind: 'skip', code: 'contract_error' } : { kind: 'ok', value };
}

/** A stored answer's step: the parsed body, or the value carried from the stored copy while ESI's copy is unchanged. */
function stored<T>(step: Step<T>, carried: T): Exclude<Step<T>, { kind: 'unchanged' }> {
  return step.kind === 'unchanged' ? { kind: 'ok', value: carried } : step;
}

async function readContainerNames(
  session: EsiReadSession,
  port: CorpContextPort,
  corporationId: number,
  accessToken: string,
  itemIds: number[],
): Promise<Exclude<Step<Record<string, string>>, { kind: 'unchanged' }>> {
  const names: Record<string, string> = {};
  for (const batch of chunk(itemIds, NAMES_BATCH)) {
    const step = parsed(await port.readAssetNames(session, corporationId, accessToken, batch), parseAssetNamesBody);
    // A pass-through POST always answers; a bodyless answer is a transient upstream failure.
    if (step.kind === 'unchanged') return { kind: 'skip', code: 'esi_server_error' };
    if (step.kind === 'skip') return step;
    Object.assign(names, step.value);
  }
  return { kind: 'ok', value: names };
}

/** Best effort: a Director off a structure's docking list gets a 403, and that name stays unknown. */
async function readStructureNames(
  session: EsiReadSession,
  port: CorpContextPort,
  accessToken: string,
  structureIds: number[],
): Promise<Record<string, string>> {
  const reads = await Promise.all(
    structureIds.map(async (id) => [id, parsed(await port.readStructure(session, id, accessToken), parseStructureBody)] as const),
  );
  const names: Record<string, string> = {};
  for (const [id, step] of reads) if (step.kind === 'ok') names[String(id)] = step.value;
  return names;
}

/** Rotates by the hour so structures that keep answering 403 cannot starve the rest past the per-pass cap. */
function structureNameBatch(ids: readonly number[], now: Date): number[] {
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length <= STRUCTURE_NAME_READS_PER_PASS) return sorted;
  const start = (Math.floor(now.getTime() / HOUR_MS) * STRUCTURE_NAME_READS_PER_PASS) % sorted.length;
  return [...sorted.slice(start), ...sorted.slice(0, start)].slice(0, STRUCTURE_NAME_READS_PER_PASS);
}

/**
 * The pass is due once any of its three stored answers has expired; the
 * others answer unchanged without a call and carry the stored copy. Every
 * answer unchanged and nothing new to name is a stamp.
 */
async function planContext(
  port: CorpContextPort,
  owner: CorpOwner,
  accessToken: string,
  session: EsiReadSession,
): Promise<PersistVerdict<CorpContextSave>> {
  const { corporationId } = owner;
  const [corporation, divisions, tracking, linked, context] = await Promise.all([
    port.readCorporation(session, corporationId, accessToken),
    port.readDivisions(session, corporationId, accessToken),
    port.readMemberTracking(session, corporationId, accessToken),
    port.listLinkedMemberIds(corporationId),
    port.currentContext(corporationId),
  ]);
  const hq = stored(parsed(corporation, parseCorporationBody), { hqStationId: context.hq.kind === 'known' ? context.hq.value : null });
  if (hq.kind === 'skip') return errorVerdict(hq.code, hq.expiresAt);
  const divisionNames = stored(parsed(divisions, parseDivisionsBody), context.divisionNames);
  if (divisionNames.kind === 'skip') return errorVerdict(divisionNames.code, divisionNames.expiresAt);
  const bases = stored(parsed(tracking, (body) => parseMemberTrackingBody(body, new Set(linked))), null);
  if (bases.kind === 'skip') return errorVerdict(bases.code, bases.expiresAt);
  const containerIds = unnamedContainerIds(context.index, context.containerNames);
  const containerNames = await readContainerNames(session, port, corporationId, accessToken, containerIds);
  if (containerNames.kind === 'skip') return errorVerdict(containerNames.code, containerNames.expiresAt);
  const structureIds = structureNameBatch(unnamedStructureIds(context.index, context.structureNames), port.now());
  const structureNames = await readStructureNames(session, port, accessToken, structureIds);
  const allUnchanged = [corporation, divisions, tracking].every((read) => read.kind === 'unchanged');
  const nothingNamed = Object.keys(containerNames.value).length === 0 && Object.keys(structureNames).length === 0;
  if (allUnchanged && nothingNamed) return { kind: 'stamp' };
  return {
    kind: 'save',
    profile: {
      hqStationId: hq.value.hqStationId,
      divisionNames: divisionNames.value,
      containerNames: mergeNames(context.containerNames, containerNames.value),
      structureNames: mergeNames(context.structureNames, structureNames),
    },
    bases: bases.value,
  };
}

function makeDescriptor(port: CorpContextPort) {
  return makeCorpDescriptor<CorpOwner, CorpContextState, CorpContextSave, EsiReadSession>(port, {
    ownerOf: (_userId, corporationId) => ({ corporationId }),
    eligible: scopeEligibility(CORP_CONTEXT_SYNC_SCOPES),
    requiredRoles: CORP_CONTEXT_REQUIRED_ROLES,
    isDue: (owner) => port.isDue(owner.corporationId),
    readState: (owner) => port.readProfileState(owner.corporationId),
    fetchAndPlan: (owner, accessToken, _state, session) => planContext(port, owner, accessToken, session),
    save: (owner, payload) => port.saveProfile(owner.corporationId, payload.profile, payload.bases, port.now()),
    stampFresh: (owner) => port.stampFresh(owner.corporationId, port.now()),
    recordRefusal: (owner, expiresAt) => port.recordRefusal(owner.corporationId, expiresAt),
  });
}

export function refreshCorpContextForUser(
  port: CorpContextPort,
  userId: string,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId);
}

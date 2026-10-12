import { isDue, readStoredAuthed, recordMetas, type EsiResponseMeta, type StoredAuthedInit } from '@/data/esi-store';
import { dedupe } from '@/lib/array';
import { singleFlight } from '@/lib/memoize';
import { type FreshTokenResult, getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { fetchAffiliations } from '@/platform/auth/affiliation-source';
import { type CorpRolesRecord, parseCharacterRolesBody } from '@/platform/auth/corp-roles';
import {
  readCorpRoles,
  readRoleCorporationId,
  type StoredCorpRoles,
  upsertCorpRoles,
} from '@/platform/auth/corp-roles-store';
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { characterRolesKey } from '@/platform/auth/roles-key';
import { scopeHolderOf } from '@/platform/auth/scope-health';
import { EsiServerError, type EsiFetchOptions } from '@/platform/esi';
import { type EnumeratedOwner, hasToken, type VendedToken } from '@/platform/owner-sync';

/** Each linked character as the syncs see it: its corporation, and whether it holds a token and the scopes. */
export function charactersWithHealth(linked: readonly LinkedCharacter[]): EnumeratedOwner[] {
  return linked.map((character) => ({
    characterId: character.characterId,
    corporationId: character.corporationId,
    ...scopeHolderOf(character),
  }));
}

export async function listCharactersWithHealth(userId: string): Promise<EnumeratedOwner[]> {
  return charactersWithHealth(await listLinkedCharacters(userId));
}

/** What a token service answer means to a sync: the token, a grant that is gone until the user relinks, or a failure for now. */
export function vendedToken(result: FreshTokenResult): VendedToken {
  switch (result.kind) {
    case 'ok':
      return result.accessToken;
    case 'not_found':
    case 'reauth_required':
      return { missing: 'lost' };
    case 'upstream_error':
      return { missing: 'unavailable' };
  }
}

/**
 * Vends one character's access token, or says why there is none. The
 * datasets a board view refreshes side by side share one in-flight vend per
 * character, so they never race each other through the refresh-token
 * rotation. Nothing outlives the vend: the next call after it settles asks
 * the token service again.
 */
export const vendTokenFor = singleFlight(async (characterId: number): Promise<VendedToken> =>
  vendedToken(await getFreshAccessTokenForCharacter(characterId)));

/** One member's roles as its probe settles: a soft ESI failure is a null answer; a budget deferral or a bug is a rejection. */
export type RolesOutcome = PromiseSettledResult<StoredCorpRoles | null>;

function answered(value: StoredCorpRoles | null): RolesOutcome {
  return { status: 'fulfilled', value };
}

function failedOutcome(error: unknown): RolesOutcome {
  return error instanceof EsiServerError ? answered(null) : { status: 'rejected', reason: error };
}

function unwrap(outcome: RolesOutcome): StoredCorpRoles | null {
  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}

function isOutcome<T extends object>(step: RolesOutcome | T): step is RolesOutcome {
  return 'status' in step;
}

/** A member past its stored answer, whose roles read the live affiliation checks guard. */
interface RolesProbe {
  readonly characterId: number;
  readonly corporationId: number;
  readonly accessToken: string;
  /** The stored row bound to this corporation, which a 304 keeps; with none the read sends no ETag. */
  readonly stored: StoredCorpRoles | null;
}

/** A 200 whose roles parsed, stored only if the live check after the read still names the corporation. */
interface FetchedRoles {
  readonly probe: RolesProbe;
  readonly record: CorpRolesRecord;
  readonly meta: EsiResponseMeta;
}

/** One shared live check: the members whose live corporation is the one their roles bind to, or the failure that settles them all. */
type LiveCheck = { readonly matching: ReadonlySet<number> } | { readonly failed: RolesOutcome };

/** A stored roles row for this corporation whose answer CCP's Expires still covers at `now`. */
export function usableStoredRoles(
  row: StoredCorpRoles | undefined,
  corporationId: number,
  now: Date,
): row is StoredCorpRoles {
  return row !== undefined
    && row.corporationId === corporationId
    && row.expiresAt !== null
    && row.expiresAt.getTime() > now.getTime();
}

/** The stored roles row bound to this corporation, whatever its expiry; null when there is none or it belongs to another. */
async function storedRolesFor(characterId: number, corporationId: number): Promise<StoredCorpRoles | null> {
  const row = (await readCorpRoles([characterId])).get(characterId);
  return row !== undefined && row.corporationId === corporationId ? row : null;
}

/**
 * The roles read's options: live and interactive for the mutation gates (a
 * user is waiting on the check), and unconditional when no stored row is
 * bound to this corporation. The held ETag describes the body, which names
 * no corporation, so after a transfer with the same roles it would answer
 * 304 for a row that is bound to the old corp; the 200 goes through
 * `storeRoles` and rebinds it.
 */
function rolesReadInit(live: boolean, bound: boolean): StoredAuthedInit {
  return { ...(live ? { live: true, interactive: true } : {}), ...(bound ? {} : { conditional: false }) };
}

/** The gate options of a live probe's affiliation checks: a mutation gate's user is waiting on them. */
function liveCheckOptions(live: boolean): EsiFetchOptions | undefined {
  return live ? { interactive: true } : undefined;
}

/** The character's stored corporation, when it is the one the caller binds the probe to. */
async function roleCorporation(characterId: number, expectedCorporationId: number | undefined): Promise<number | null> {
  const corporationId = await readRoleCorporationId(characterId);
  return expectedCorporationId === undefined || corporationId === expectedCorporationId ? corporationId : null;
}

/**
 * Whether a member needs a roles read. Until CCP's expiry the stored row
 * stands on the local affiliation alone; after it (or on a live probe) the
 * member is probed.
 */
async function planProbe(
  characterId: number,
  accessToken: string,
  expectedCorporationId: number | undefined,
  live: boolean,
): Promise<RolesOutcome | RolesProbe> {
  const corporationId = await roleCorporation(characterId, expectedCorporationId);
  if (corporationId === null) return answered(null);
  const stored = await storedRolesFor(characterId, corporationId);
  if (!live && !(await isDue([characterRolesKey(characterId)]))) return answered(stored);
  return { characterId, corporationId, accessToken, stored };
}

/**
 * The live affiliation check around role reads: always a call, nothing
 * stored, as the plan keeps it, with one POST for every member it guards.
 * Roles do not identify their corporation, so only a member whose live
 * corporation is the one its roles bind to passes; a transient answer
 * passes nobody.
 */
async function liveCheck(probes: readonly RolesProbe[], opts: EsiFetchOptions | undefined): Promise<LiveCheck> {
  if (probes.length === 0) return { matching: new Set() };
  const result = await fetchAffiliations(probes.map((probe) => probe.characterId), opts);
  const expected = new Map(probes.map((probe) => [probe.characterId, probe.corporationId]));
  const matching = result.transientFailure ? [] : result.rows.filter((row) => expected.get(row.characterId) === row.corporationId);
  return { matching: new Set(matching.map((row) => row.characterId)) };
}

function checkLive(probes: readonly RolesProbe[], opts: EsiFetchOptions | undefined): Promise<LiveCheck> {
  return liveCheck(probes, opts).catch((error: unknown) => ({ failed: failedOutcome(error) }));
}

function passes(check: LiveCheck, probe: RolesProbe): boolean {
  return 'matching' in check && check.matching.has(probe.characterId);
}

function stopped(check: LiveCheck): RolesOutcome {
  return 'failed' in check ? check.failed : answered(null);
}

/** One member's roles read: a 304 keeps the stored row, a 200 that parses goes on to the check after the read. */
async function readRoles(probe: RolesProbe, live: boolean): Promise<RolesOutcome | FetchedRoles> {
  const read = await readStoredAuthed(characterRolesKey(probe.characterId), probe.accessToken, rolesReadInit(live, probe.stored !== null));
  if (read.kind === 'unchanged') return answered(probe.stored);
  if (read.kind === 'error') return answered(null);
  const record = parseCharacterRolesBody(read.body);
  return record === null ? answered(null) : { probe, record, meta: read.meta };
}

/**
 * Stores a 200's roles, then records its meta: never the other way round,
 * so a 304 can never stand for roles that were not stored. The meta is
 * recorded without a tag clear: no cached reader carries the roles tag
 * (corp_member_roles is read uncached through storedRowJoin), and the
 * viewer fetches roles during a page render, where revalidateTag throws.
 */
async function storeRoles({ probe, record, meta }: FetchedRoles): Promise<RolesOutcome> {
  const { characterId, corporationId } = probe;
  const fetchedAt = new Date();
  // The upsert binds to the stored affiliation too, so a transfer it has already seen stores nothing.
  if (!await upsertCorpRoles(characterId, record, fetchedAt, corporationId)) return answered(null);
  await recordMetas([meta]);
  return answered({ ...record, characterId, corporationId, fetchedAt, expiresAt: meta.expiresAt === null ? null : new Date(meta.expiresAt) });
}

/** Settled outcomes by character, and the steps still pending. */
function splitSettled<T extends object>(
  steps: readonly (readonly [number, RolesOutcome | T])[],
): { readonly outcomes: Map<number, RolesOutcome>; readonly pending: T[] } {
  const outcomes = new Map<number, RolesOutcome>();
  const pending: T[] = [];
  for (const [characterId, step] of steps) {
    if (isOutcome(step)) outcomes.set(characterId, step);
    else pending.push(step);
  }
  return { outcomes, pending };
}

/**
 * Reads the probed members' roles between two shared live checks: one
 * affiliation POST before the reads for every member, and one after for
 * the members whose read returned a 200. Each member still has its live
 * corporation checked before and after its own read; a 304 needs no check
 * after, since it stores nothing.
 */
async function probeRoles(probes: readonly RolesProbe[], live: boolean): Promise<Map<number, RolesOutcome>> {
  const opts = liveCheckOptions(live);
  const before = await checkLive(probes, opts);
  const reads = await Promise.all(probes.map(async (probe) => [
    probe.characterId,
    passes(before, probe) ? await readRoles(probe, live).catch(failedOutcome) : stopped(before),
  ] as const));
  const { outcomes, pending } = splitSettled(reads);
  const after = await checkLive(pending.map((fetched) => fetched.probe), opts);
  await Promise.all(pending.map(async (fetched) => {
    outcomes.set(fetched.probe.characterId, passes(after, fetched.probe) ? await storeRoles(fetched).catch(failedOutcome) : stopped(after));
  }));
  return outcomes;
}

/** One character's roles through the response store, probed alone. */
async function probeAndStoreRolesRecord(
  characterId: number,
  accessToken: string,
  expectedCorporationId?: number,
  live = false,
): Promise<StoredCorpRoles | null> {
  const plan = await planProbe(characterId, accessToken, expectedCorporationId, live).catch(failedOutcome);
  if (isOutcome(plan)) return unwrap(plan);
  return unwrap((await probeRoles([plan], live)).get(characterId) ?? answered(null));
}

function globalRoles(record: StoredCorpRoles | null): string[] | null {
  return record === null ? null : [...record.roles];
}

/** Always asks ESI, and still records what it learns. The mutation gates bind it to the corporation they guard. */
export async function probeAndStoreRoles(
  characterId: number,
  accessToken: string,
  expectedCorporationId?: number,
): Promise<string[] | null> {
  return globalRoles(await probeAndStoreRolesRecord(characterId, accessToken, expectedCorporationId, true));
}

/** The corp sync passes' roles read while they pick a credential: the stored row until CCP's expiry, else a probe. */
export async function readRolesForSync(characterId: number, accessToken: string): Promise<string[] | null> {
  return globalRoles(await probeAndStoreRolesRecord(characterId, accessToken));
}

async function planMember(characterId: number): Promise<RolesOutcome | RolesProbe> {
  const accessToken = await vendTokenFor(characterId);
  return hasToken(accessToken) ? planProbe(characterId, accessToken, undefined, false) : answered(null);
}

/**
 * The viewer's roles for the members whose stored answer it cannot use, in
 * one pass: the same decision as a sync's read, with each token vended here
 * and the live affiliation checks shared, so a viewer with M members past
 * CCP's expiry costs two affiliation POSTs instead of up to 2M.
 */
export async function fetchCorpRolesForMembers(characterIds: readonly number[]): Promise<ReadonlyMap<number, RolesOutcome>> {
  const plans = await Promise.all(dedupe([...characterIds]).map(async (characterId) =>
    [characterId, await planMember(characterId).catch(failedOutcome)] as const));
  const { outcomes, pending } = splitSettled(plans);
  for (const [characterId, outcome] of await probeRoles(pending, false)) outcomes.set(characterId, outcome);
  return outcomes;
}

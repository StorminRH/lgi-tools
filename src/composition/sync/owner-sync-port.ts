import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { singleFlight } from '@/lib/memoize';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { fetchAffiliations } from '@/platform/auth/affiliation-source';
import { parseCharacterRolesBody } from '@/platform/auth/corp-roles';
import {
  readCorpRoles,
  readRoleCorporationId,
  type StoredCorpRoles,
  upsertCorpRoles,
} from '@/platform/auth/corp-roles-store';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { scopeHolderOf } from '@/platform/auth/scope-health';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import { readEsiAuthed, readEsiAuthedPost, readEsiPagedAuthed } from '@/platform/esi/authed-read';
import { characterRolesPath } from '@/platform/esi/paths';
import type { EnumeratedOwner, PagedOwnerReadResult, SingleOwnerRead } from '@/platform/owner-sync';

export async function listCharactersWithHealth(userId: string): Promise<EnumeratedOwner[]> {
  const linked = await listLinkedCharacters(userId);
  return linked.map((character) => ({
    characterId: character.characterId,
    corporationId: character.corporationId,
    ...scopeHolderOf(character),
  }));
}

/**
 * Vends one character's access token. The datasets a board view refreshes side
 * by side share one in-flight vend per character, so they never race each
 * other through the refresh-token rotation. Nothing outlives the vend: the
 * next call after it settles asks the token service again.
 */
export const vendTokenFor = singleFlight(async (characterId: number): Promise<string | null> => {
  const result = await getFreshAccessTokenForCharacter(characterId);
  return result.kind === 'ok' ? result.accessToken : null;
});

function softEsiFailure(error: unknown): null {
  if (error instanceof EsiBudgetExhaustedError) throw error;
  if (error instanceof EsiServerError) return null;
  throw error;
}

async function hasMatchingLiveCorporation(characterId: number, corporationId: number): Promise<boolean> {
  const result = await fetchAffiliations([characterId]);
  return !result.transientFailure
    && result.rows.some((row) => row.characterId === characterId && row.corporationId === corporationId);
}

const ROLES_FRESHNESS = freshnessGate('character_corp_roles');

/** A stored roles row for this corporation that the character_corp_roles TTL still accepts at `now`. */
export function usableStoredRoles(
  row: StoredCorpRoles | undefined,
  corporationId: number,
  now: Date,
): row is StoredCorpRoles {
  return row !== undefined && row.corporationId === corporationId && !ROLES_FRESHNESS.isStale(row.fetchedAt, now);
}

async function reusableStoredRoles(
  characterId: number,
  corporationId: number,
  reuseFreshAt: Date | undefined,
): Promise<StoredCorpRoles | null> {
  if (reuseFreshAt === undefined) return null;
  const row = (await readCorpRoles([characterId])).get(characterId);
  return usableStoredRoles(row, corporationId, reuseFreshAt) ? row : null;
}

async function probeAndStoreRolesRecord(
  characterId: number,
  accessToken: string,
  expectedCorporationId?: number,
  reuseFreshAt?: Date,
): Promise<StoredCorpRoles | null> {
  try {
    const corporationId = await readRoleCorporationId(characterId);
    if (corporationId === null || (expectedCorporationId !== undefined && corporationId !== expectedCorporationId)) return null;
    // A reused row is trusted on the local affiliation alone, as resolveCorpViewer
    // trusts it; ESI still authorizes the corp read the credential is picked for.
    const reused = await reusableStoredRoles(characterId, corporationId, reuseFreshAt);
    if (reused !== null) return reused;
    if (!await hasMatchingLiveCorporation(characterId, corporationId)) return null;
    const read = await readEsiAuthed(characterRolesPath(characterId), accessToken, null);
    if (read.kind !== 'fresh') return null;
    const record = parseCharacterRolesBody(read.body);
    if (record === null) return null;
    // Roles do not identify their corporation. Reject a transfer during the read,
    // even when the stored affiliation has not caught up yet.
    if (!await hasMatchingLiveCorporation(characterId, corporationId)) return null;
    const fetchedAt = new Date();
    const stored = await upsertCorpRoles(characterId, record, fetchedAt, corporationId);
    return stored ? { ...record, characterId, corporationId, fetchedAt } : null;
  } catch (error) {
    return softEsiFailure(error);
  }
}

function globalRoles(record: StoredCorpRoles | null): string[] | null {
  return record === null ? null : [...record.roles];
}

/** Always asks ESI. The mutation gates bind it to the corporation they guard. */
export async function probeAndStoreRoles(
  characterId: number,
  accessToken: string,
  expectedCorporationId?: number,
): Promise<string[] | null> {
  return globalRoles(await probeAndStoreRolesRecord(characterId, accessToken, expectedCorporationId));
}

/**
 * The corp sync passes' roles read while they pick a credential: a stored
 * same-corporation row inside the character_corp_roles TTL, else the live
 * probe, which stores what it reads.
 */
export async function readRolesForSync(characterId: number, accessToken: string): Promise<string[] | null> {
  return globalRoles(await probeAndStoreRolesRecord(characterId, accessToken, undefined, new Date()));
}

export async function fetchAndStoreCorpRoles(characterId: number): Promise<StoredCorpRoles | null> {
  const accessToken = await vendTokenFor(characterId);
  return accessToken === null ? null : probeAndStoreRolesRecord(characterId, accessToken);
}

/**
 * Runs one authed ESI read for a sync port. An EsiServerError becomes the soft
 * `esi_server_error` result; a budget deferral or any other failure still throws.
 */
async function softRead<T>(read: () => Promise<T>): Promise<T | { kind: 'error'; code: string }> {
  try {
    return await read();
  } catch (error) {
    softEsiFailure(error);
    return { kind: 'error', code: 'esi_server_error' };
  }
}

export function readSingleEndpoint(
  path: string,
  accessToken: string,
  heldEtag: string | null,
): Promise<SingleOwnerRead> {
  return softRead(() => readEsiAuthed(path, accessToken, heldEtag));
}

export function postSingleEndpoint(path: string, accessToken: string, body: unknown): Promise<SingleOwnerRead> {
  return softRead(() => readEsiAuthedPost(path, accessToken, body));
}

export function readPagedEndpoint(
  basePath: string,
  accessToken: string,
  heldEtags: string[],
): Promise<PagedOwnerReadResult> {
  return softRead(() => readEsiPagedAuthed(basePath, accessToken, heldEtags));
}

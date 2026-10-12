import { commit, datasetTag, isDue, readStoredAuthed, type EsiResponseMeta } from '@/data/esi-store';
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
import { type LinkedCharacter, listLinkedCharacters } from '@/platform/auth/linked-characters';
import { characterRolesKey } from '@/platform/auth/roles-key';
import { scopeHolderOf } from '@/platform/auth/scope-health';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import type { EnumeratedOwner } from '@/platform/owner-sync';

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

/** The live affiliation check inside a role probe: always a call, nothing stored, as the plan keeps it. */
async function hasMatchingLiveCorporation(characterId: number, corporationId: number): Promise<boolean> {
  const result = await fetchAffiliations([characterId]);
  return !result.transientFailure
    && result.rows.some((row) => row.characterId === characterId && row.corporationId === corporationId);
}

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

async function storedRolesFor(characterId: number, corporationId: number): Promise<StoredCorpRoles | null> {
  const row = (await readCorpRoles([characterId])).get(characterId);
  return row !== undefined && row.corporationId === corporationId ? row : null;
}

/** Stores a 200's roles, then records its meta: never the other way round, so a 304 can never stand for roles that were not stored. */
async function storeRoles(
  characterId: number,
  corporationId: number,
  body: unknown,
  meta: EsiResponseMeta,
): Promise<StoredCorpRoles | null> {
  const record = parseCharacterRolesBody(body);
  if (record === null) return null;
  // Roles do not identify their corporation. Reject a transfer during the read,
  // even when the stored affiliation has not caught up yet.
  if (!await hasMatchingLiveCorporation(characterId, corporationId)) return null;
  const fetchedAt = new Date();
  if (!await upsertCorpRoles(characterId, record, fetchedAt, corporationId)) return null;
  await commit([meta], { tag: datasetTag(meta.key) });
  return { ...record, characterId, corporationId, fetchedAt, expiresAt: meta.expiresAt === null ? null : new Date(meta.expiresAt) };
}

/**
 * One character's roles through the response store. Until CCP's expiry the
 * stored row stands on the local affiliation alone; after it (or on a live
 * probe) the live affiliation is checked, the read carries the held ETag,
 * and a 304 keeps the stored row while a 200 replaces it.
 */
async function probeAndStoreRolesRecord(
  characterId: number,
  accessToken: string,
  expectedCorporationId?: number,
  live = false,
): Promise<StoredCorpRoles | null> {
  try {
    const corporationId = await readRoleCorporationId(characterId);
    if (corporationId === null || (expectedCorporationId !== undefined && corporationId !== expectedCorporationId)) return null;
    const key = characterRolesKey(characterId);
    if (!live && !(await isDue([key]))) return storedRolesFor(characterId, corporationId);
    if (!await hasMatchingLiveCorporation(characterId, corporationId)) return null;
    const read = await readStoredAuthed(key, accessToken, live ? { live: true } : {});
    if (read.kind === 'unchanged') return storedRolesFor(characterId, corporationId);
    if (read.kind === 'error') return null;
    return await storeRoles(characterId, corporationId, read.body, read.meta);
  } catch (error) {
    return softEsiFailure(error);
  }
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

/** The viewer's roles read: the same decision, with the token vended here. */
export async function fetchAndStoreCorpRoles(characterId: number): Promise<StoredCorpRoles | null> {
  const accessToken = await vendTokenFor(characterId);
  return accessToken === null ? null : probeAndStoreRolesRecord(characterId, accessToken);
}

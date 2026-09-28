import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { parseCharacterRolesBody } from '@/platform/auth/corp-roles';
import { readRoleCorporationId, type StoredCorpRoles, upsertCorpRoles } from '@/platform/auth/corp-roles-store';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import { readEsiAuthed, readEsiAuthedPost, readEsiPagedAuthed } from '@/platform/esi/authed-read';
import type { EsiResponseHeaders } from '@/platform/esi/response-metadata';

export interface LinkedCharacterHealth {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export async function listCharactersWithHealth(userId: string): Promise<LinkedCharacterHealth[]> {
  const linked = await listLinkedCharacters(userId);
  return linked.map((character) => ({
    characterId: character.characterId,
    corporationId: character.corporationId,
    hasRefreshToken: character.hasRefreshToken,
    missingScopes: deriveCharacterHealth({
      scope: character.scope,
      hasRefreshToken: character.hasRefreshToken,
    }).missingScopes,
  }));
}

export async function vendTokenFor(characterId: number): Promise<string | null> {
  const result = await getFreshAccessTokenForCharacter(characterId);
  return result.kind === 'ok' ? result.accessToken : null;
}

function softEsiFailure(error: unknown): null {
  if (error instanceof EsiBudgetExhaustedError) throw error;
  if (error instanceof EsiServerError) return null;
  throw error;
}

async function probeAndStoreRolesRecord(
  characterId: number,
  accessToken: string,
  expectedCorporationId?: number,
): Promise<StoredCorpRoles | null> {
  try {
    const corporationId = await readRoleCorporationId(characterId);
    if (corporationId === null || (expectedCorporationId !== undefined && corporationId !== expectedCorporationId)) return null;
    const read = await readEsiAuthed(`/characters/${characterId}/roles`, accessToken, null);
    if (read.kind !== 'fresh') return null;
    const record = parseCharacterRolesBody(read.body);
    if (record === null) return null;
    const fetchedAt = new Date();
    const stored = await upsertCorpRoles(characterId, record, fetchedAt, corporationId);
    return stored ? { ...record, characterId, corporationId, fetchedAt } : null;
  } catch (error) {
    return softEsiFailure(error);
  }
}

export async function probeAndStoreRoles(
  characterId: number,
  accessToken: string,
  expectedCorporationId?: number,
): Promise<string[] | null> {
  const record = await probeAndStoreRolesRecord(characterId, accessToken, expectedCorporationId);
  return record === null ? null : [...record.roles];
}

export async function fetchAndStoreCorpRoles(characterId: number): Promise<StoredCorpRoles | null> {
  const accessToken = await vendTokenFor(characterId);
  return accessToken === null ? null : probeAndStoreRolesRecord(characterId, accessToken);
}

export type AuthedSingleRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

export type AuthedPagedRead =
  | { kind: 'fresh'; items: unknown[]; etags: string[]; responseHeaders: EsiResponseHeaders }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

function esiThrowToError(error: unknown): { kind: 'error'; code: string } {
  softEsiFailure(error);
  return { kind: 'error', code: 'esi_server_error' };
}

export async function readSingleEndpoint(
  path: string,
  accessToken: string,
  heldEtag: string | null,
): Promise<AuthedSingleRead> {
  try {
    const read = await readEsiAuthed(path, accessToken, heldEtag);
    if (read.kind === 'fresh') return { kind: 'fresh', body: read.body, etag: read.etag };
    if (read.kind === 'unchanged') return { kind: 'unchanged' };
    return { kind: 'error', code: read.code };
  } catch (error) {
    return esiThrowToError(error);
  }
}

export async function postSingleEndpoint(path: string, accessToken: string, body: unknown): Promise<AuthedSingleRead> {
  try {
    const read = await readEsiAuthedPost(path, accessToken, body);
    if (read.kind === 'fresh') return { kind: 'fresh', body: read.body, etag: read.etag };
    if (read.kind === 'unchanged') return { kind: 'unchanged' };
    return { kind: 'error', code: read.code };
  } catch (error) {
    return esiThrowToError(error);
  }
}

export async function readPagedEndpoint(
  basePath: string,
  accessToken: string,
  heldEtags: string[],
): Promise<AuthedPagedRead> {
  try {
    const read = await readEsiPagedAuthed(basePath, accessToken, heldEtags);
    if (read.kind === 'fresh') {
      return {
        kind: 'fresh',
        items: read.items,
        etags: read.etags,
        responseHeaders: read.responseHeaders,
      };
    }
    if (read.kind === 'unchanged') return { kind: 'unchanged' };
    return { kind: 'error', code: read.code };
  } catch (error) {
    return esiThrowToError(error);
  }
}

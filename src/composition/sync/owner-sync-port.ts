import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { type CorpRolesRecord, parseCharacterRolesBody } from '@/platform/auth/corp-roles';
import { upsertCorpRoles } from '@/platform/auth/corp-roles-store';
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

/** Every live roles read keeps corp_member_roles warm; this is the one writer. */
async function readCorpRolesRecord(characterId: number, accessToken: string): Promise<CorpRolesRecord | null> {
  try {
    const read = await readEsiAuthed(`/characters/${characterId}/roles`, accessToken, null);
    if (read.kind !== 'fresh') return null;
    const record = parseCharacterRolesBody(read.body);
    if (record === null) return null;
    await upsertCorpRoles(characterId, record, new Date());
    return record;
  } catch (error) {
    return softEsiFailure(error);
  }
}

/** The credential probe: the global roles list the corp sync selects a token by. */
export async function readRolesFor(characterId: number, accessToken: string): Promise<string[] | null> {
  const record = await readCorpRolesRecord(characterId, accessToken);
  return record === null ? null : [...record.roles];
}

/** The viewer's inline refetch: vends the token itself and returns the full stored record. */
export async function fetchCorpRoles(characterId: number): Promise<CorpRolesRecord | null> {
  const accessToken = await vendTokenFor(characterId);
  return accessToken === null ? null : readCorpRolesRecord(characterId, accessToken);
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

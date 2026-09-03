import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { getUserAffiliations } from '@/platform/auth/affiliation-store';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import { readEsiAuthed, readEsiPagedAuthed } from '@/platform/esi/authed-read';
import type { OwnerKey } from '@/platform/owner-sync';
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

export async function resolveOwnedOwnersForUser(userId: string): Promise<OwnerKey[]> {
  const [linked, affiliations] = await Promise.all([
    listLinkedCharacters(userId),
    getUserAffiliations(userId),
  ]);
  const owners: OwnerKey[] = linked.map((c) => ({ ownerType: 'character', ownerId: c.characterId }));
  const corpIds = new Set<number>();
  for (const affiliation of affiliations) {
    if (affiliation.corporationId !== null) corpIds.add(affiliation.corporationId);
  }
  for (const corporationId of corpIds) {
    owners.push({ ownerType: 'corporation', ownerId: corporationId });
  }
  return owners;
}

export async function vendTokenFor(characterId: number): Promise<string | null> {
  const result = await getFreshAccessTokenForCharacter(characterId);
  return result.kind === 'ok' ? result.accessToken : null;
}

function extractRoles(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const roles = (body as { roles?: unknown }).roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

export async function readRolesFor(characterId: number, accessToken: string): Promise<string[] | null> {
  try {
    const read = await readEsiAuthed(`/characters/${characterId}/roles`, accessToken, null);
    return read.kind === 'fresh' ? extractRoles(read.body) : null;
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) throw error;
    if (error instanceof EsiServerError) return null;
    throw error;
  }
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
  if (error instanceof EsiBudgetExhaustedError) throw error;
  if (error instanceof EsiServerError) return { kind: 'error', code: 'esi_server_error' };
  throw error;
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

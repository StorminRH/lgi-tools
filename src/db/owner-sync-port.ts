// Shared owner-sync port wiring (MIGRATE.D.2). The five per-owner ESI→Neon sync
// wrappers (src/db/*-sync.ts) each built the SAME auth + ESI plumbing for their port:
// character enumeration with scope health, token vend, in-game roles read, and the
// authed read → slice-contract mapping with the ESI budget / 5xx swallow. This factors
// those identical pieces into one place. It lives in src/db (the unconstrained
// composition layer) because it touches the auth slice (token vend, affiliation/scope
// reads) AND lib/esi — a cross-slice join the feature boundary forbids inside a slice.
// Each wrapper composes these with its own slice-specific Neon read/save/stamp methods.
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';
import { getUserAffiliations } from '@/features/auth/affiliation-store';
import { listLinkedCharacters } from '@/features/auth/linked-characters';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { EsiBudgetExhaustedError, EsiServerError } from '@/lib/esi';
import { readEsiAuthed, readEsiPagedAuthed } from '@/lib/esi/authed-read';
import type { OwnerKey } from '@/lib/owner-sync';
import type { EsiResponseHeaders } from '@/lib/esi/response-metadata';

/**
 * A linked character with derived scope health — the shape every per-owner refresh
 * enumerates. corporationId is always included (the corp axis needs it); character-only
 * slices simply ignore it.
 */
export interface LinkedCharacterHealth {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

/** The user's linked characters with the scope health the eligibility predicates read. */
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

/**
 * The owned-* read-side owners for a user: their linked characters, plus the
 * corporations any of their characters is currently a member of (cheap — read straight
 * off the affiliation cache, no role read; the refresh side is what gates on the
 * Director role). Owners with no stored rows simply contribute nothing to the map.
 */
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

/** A fresh access token for a character, or null when unavailable / reauth-needed. */
export async function vendTokenFor(characterId: number): Promise<string | null> {
  const result = await getFreshAccessTokenForCharacter(characterId);
  return result.kind === 'ok' ? result.accessToken : null;
}

// Map ESI's role body ({ roles?: string[] }) to a plain string list. Defensive (ESI is
// an external boundary): a missing/foreign shape reads as no roles.
function extractRoles(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const roles = (body as { roles?: unknown }).roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

/** A character's in-game corp roles (for the Director gate), or null on an ESI error. */
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

/**
 * The slice ReadResult shapes (single + paged), decoupled from lib/esi's EsiAuthedRead
 * (the Neon path's fixed TTL ignores the ESI cache window the gate returns) — structurally
 * identical to each slice's own JobsEsiRead / SkillsEsiRead and OwnedXReadResult.
 */
export type AuthedSingleRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/**
 * Owner-sync port for an authenticated paginated ESI read; it returns normalized items plus the
 * response metadata that controls freshness.
 */
export type AuthedPagedRead =
  | { kind: 'fresh'; items: unknown[]; etags: string[]; responseHeaders: EsiResponseHeaders }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

// Map an ESI gate throw to the owner-sync outcome seam. Budget exhaustion is
// rethrown so the engine can enqueue the exact owner; 5xx becomes a retryable
// soft code so one owner's miss never aborts the pass.
function esiThrowToError(error: unknown): { kind: 'error'; code: string } {
  if (error instanceof EsiBudgetExhaustedError) throw error;
  if (error instanceof EsiServerError) return { kind: 'error', code: 'esi_server_error' };
  throw error;
}

/**
 * One authed single-endpoint read mapped to the slice contract (a 4xx is already a soft
 * 'error' code from the reader).
 */
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

/** One authed paginated read mapped to the slice contract, same best-effort swallow. */
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

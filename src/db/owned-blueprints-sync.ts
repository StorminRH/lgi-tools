// Owned-blueprints composition layer (MIGRATE.0). Lives here, above the slices,
// because it is the only point that touches BOTH the auth slice (per-character
// token vend, affiliation/scope reads) AND the owned-blueprints slice (the ESI→
// projection + Neon storage) — a cross-slice join the feature boundary forbids
// inside either slice (the sde-pipeline.ts pattern). This wires the real port the
// pure refresh orchestration runs over, and exposes the on-view seam 3.7.5.2's
// per-component ME transform consumes: read the current owned-BP map, fire a
// stale-gated write-behind refresh behind the response (zero added latency, like
// the affiliation on-view refresh and the market-prices getLivePrices).
import { after } from 'next/server';
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';
import { getUserAffiliations, listLinkedCharacters } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import type { OwnedBlueprintMap } from '@/features/owned-blueprints/blueprint-map';
import { getOwnedBlueprintMap, readOwnerSyncState, saveOwnedBlueprints, stampOwnerFresh } from '@/features/owned-blueprints/queries';
import { refreshOwnedBlueprintsForUser } from '@/features/owned-blueprints/refresh';
import type { OwnedBlueprintsPort, OwnedBlueprintsReadResult, OwnerKey, RefreshCharacter } from '@/features/owned-blueprints/types';
import { EsiBudgetExhaustedError, EsiServerError } from '@/lib/esi';
import { readEsiAuthed, readEsiPagedAuthed } from '@/lib/esi/authed-read';

// Map ESI's role body ({ roles?: string[] }) to a plain string list. Defensive
// (ESI is an external boundary): a missing/foreign shape reads as no roles.
function extractRoles(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const roles = (body as { roles?: unknown }).roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

// The real port. Auth + ESI + Neon, each method mapping its underlying result
// into the slice's port contract. ESI budget exhaustion / 5xx are swallowed to a
// soft skip (best-effort per owner), never thrown out of the on-view refresh.
function makeOwnedBlueprintsPort(): OwnedBlueprintsPort {
  return {
    now: () => new Date(),

    async listCharacters(userId: string): Promise<RefreshCharacter[]> {
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
    },

    async vendToken(characterId: number): Promise<string | null> {
      const result = await getFreshAccessTokenForCharacter(characterId);
      return result.kind === 'ok' ? result.accessToken : null;
    },

    async readRoles(characterId: number, accessToken: string): Promise<string[] | null> {
      try {
        const read = await readEsiAuthed(`/characters/${characterId}/roles`, accessToken, null);
        return read.kind === 'fresh' ? extractRoles(read.body) : null;
      } catch (error) {
        if (error instanceof EsiBudgetExhaustedError || error instanceof EsiServerError) return null;
        throw error;
      }
    },

    async readBlueprints(
      basePath: string,
      accessToken: string,
      heldEtags: string[],
    ): Promise<OwnedBlueprintsReadResult> {
      try {
        const read = await readEsiPagedAuthed(basePath, accessToken, heldEtags);
        if (read.kind === 'fresh') return { kind: 'fresh', items: read.items, etags: read.etags };
        if (read.kind === 'unchanged') return { kind: 'unchanged' };
        return { kind: 'error', code: read.code };
      } catch (error) {
        if (error instanceof EsiBudgetExhaustedError) return { kind: 'error', code: 'budget_exhausted' };
        if (error instanceof EsiServerError) return { kind: 'error', code: 'esi_server_error' };
        throw error;
      }
    },

    readSyncState: (owner: OwnerKey) => readOwnerSyncState(owner),
    saveBlueprints: (owner, rows, etags) => saveOwnedBlueprints(owner, rows, etags),
    stampFresh: (owner: OwnerKey) => stampOwnerFresh(owner),
  };
}

// The user's blueprint owners for the READ: their linked characters, plus the
// corporations any of their characters is currently a member of (cheap — read
// straight off the affiliation cache, no role read; the refresh side is what
// gates on the Director role). Owners with no stored rows simply contribute
// nothing to the map.
async function resolveOwnersForUser(userId: string): Promise<OwnerKey[]> {
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

// The on-view seam: return the current owned-BP map immediately, and fire a
// stale-gated write-behind refresh behind the response. A re-view inside the 1h
// window makes no ESI call (the refresh's per-owner staleness gate is the dedup).
export async function getOwnedBlueprintsOnView(userId: string): Promise<OwnedBlueprintMap> {
  const owners = await resolveOwnersForUser(userId);
  const map = await getOwnedBlueprintMap(owners);
  after(() => refreshOwnedBlueprintsForUser(makeOwnedBlueprintsPort(), userId));
  return map;
}

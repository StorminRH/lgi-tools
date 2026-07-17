// POST /api/internal/eve-characters
// Internal service endpoint (3.4.7). A Convex action authenticates with the
// shared CONVEX_SERVICE_SECRET bearer and asks which EVE characters are linked
// to one user, plus each character's scope health. This is the sync flow's
// ownership boundary: the action only ever acts on the characters returned
// here for the userId it authenticated via the spine's JWT — no client-posted
// character id carries authority. The response holds no token material.
// authz: service
// rate-limit: exempt — bearer-secret service auth, not an IP-keyed public surface.
import { after } from 'next/server';
import { refreshAffiliations } from '@/features/auth/affiliation';
import {
  eveCharactersRequestSchema,
  type EveCharactersResponse,
} from '@/features/auth/api-contract';
import { isAffiliationStale } from '@/features/auth/membership';
import { listLinkedCharacters } from '@/features/auth/linked-characters';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { parseJsonBody } from '@/lib/route-body';
import { requireServiceAuth } from '@/lib/service-auth';

/**
 * Handles POST requests for /api/internal/eve-characters; this route owns its authorization,
 * boundary validation, and typed response mapping.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = await requireServiceAuth(req);
  if (denied) return denied;

  const parsed = await parseJsonBody(req, eveCharactersRequestSchema);
  if (!parsed.ok) return parsed.response;

  // An unknown userId simply has no linked characters — same response shape,
  // empty list; the caller's sync writes nothing.
  const linked = await listLinkedCharacters(parsed.data.userId);

  // On-view affiliation refresh (3.7.3.2). This enumeration boundary runs whenever
  // a live surface (incl. the corp sync) is active, so it doubles as the on-view
  // trigger: refresh any character whose cached corp is stale, behind the response
  // (write-behind, zero added latency) so the NEXT run reads fresh corp ids. The
  // current response still carries the cached corp id (≤1h stale is accepted), and
  // the stale gate makes this a no-op (no ESI) when affiliations are fresh.
  const now = new Date();
  const staleIds = linked
    .filter((character) => isAffiliationStale(character.affiliationRefreshedAt, now))
    .map((character) => character.characterId);
  if (staleIds.length > 0) {
    after(() => refreshAffiliations(staleIds));
  }

  return Response.json({
    characters: linked.map((character) => {
      const health = deriveCharacterHealth({
        scope: character.scope,
        hasRefreshToken: character.hasRefreshToken,
      });
      return {
        characterId: character.characterId,
        name: character.name,
        hasRefreshToken: character.hasRefreshToken,
        missingScopes: health.missingScopes,
        corporationId: character.corporationId,
      };
    }),
  } satisfies EveCharactersResponse);
}

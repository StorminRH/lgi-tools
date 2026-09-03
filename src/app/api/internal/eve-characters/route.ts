import { after } from 'next/server';
import { refreshAffiliations } from '@/platform/auth/affiliation';
import {
  eveCharactersEndpoint,
  eveCharactersRequestSchema,
} from '@/platform/auth/api-contract';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { checkBearerSecret } from '@/lib/service-auth';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

export async function POST(req: Request): Promise<Response> {
  const auth = await checkBearerSecret(req, 'CONVEX_SERVICE_SECRET');
  if (!auth.ok) return apiResponse(eveCharactersEndpoint, auth.failure.code === 'not_configured' ? 500 : 401, auth.failure);

  const parsed = await readJsonBody(req, eveCharactersRequestSchema);
  if (!parsed.ok) return apiResponse(eveCharactersEndpoint, 400, parsed.failure);

  const linked = await listLinkedCharacters(parsed.data.userId);

  const now = new Date();
  const staleIds = linked
    .filter((character) =>
      AFFILIATION_FRESHNESS.isStale(character.affiliationRefreshedAt, now),
    )
    .map((character) => character.characterId);
  if (staleIds.length > 0) {
    after(() => refreshAffiliations(staleIds));
  }

  return apiResponse(eveCharactersEndpoint, 200, {
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
  });
}

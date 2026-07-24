// POST /api/internal/eve-token
// Internal service endpoint. A Convex action authenticates with the shared
// CONVEX_SERVICE_SECRET bearer and asks for a fresh short-lived EVE access token
// for one character. The response carries ONLY the access token — the refresh
// token is never read into this file, so it cannot leak to the caller. Per-user
// ownership of the character is rechecked here after service authentication so
// a caller cannot turn a character id from another enumeration into a token.
// authz: service
// rate-limit: exempt — bearer-secret service auth, not an IP-keyed public surface.
import {
  eveTokenEndpoint,
  eveTokenRequestSchema,
} from '@/platform/auth/api-contract';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { accountBelongsToUser } from '@/platform/auth/linked-characters';
import {
  conflictFailure,
  dependencyUnavailableFailure,
  notFoundFailure,
} from '@/lib/failure';
import { checkBearerSecret } from '@/lib/service-auth';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * Handles POST requests for /api/internal/eve-token; this route owns its authorization, boundary
 * validation, and typed response mapping.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await checkBearerSecret(req, 'CONVEX_SERVICE_SECRET');
  if (!auth.ok) return apiResponse(eveTokenEndpoint, auth.failure.code === 'not_configured' ? 500 : 401, auth.failure);

  const parsed = await readJsonBody(req, eveTokenRequestSchema);
  if (!parsed.ok) return apiResponse(eveTokenEndpoint, 400, parsed.failure);

  if (!(await accountBelongsToUser(parsed.data.userId, parsed.data.characterId))) {
    return apiResponse(eveTokenEndpoint, 404, notFoundFailure());
  }

  const result = await getFreshAccessTokenForCharacter(parsed.data.characterId);
  switch (result.kind) {
    case 'ok':
      return apiResponse(eveTokenEndpoint, 200, {
        accessToken: result.accessToken,
      });
    case 'not_found':
      return apiResponse(eveTokenEndpoint, 404, notFoundFailure());
    case 'reauth_required':
      return apiResponse(eveTokenEndpoint, 409, conflictFailure('reauth_required'));
    case 'upstream_error':
      return apiResponse(
        eveTokenEndpoint,
        502,
        dependencyUnavailableFailure('upstream_error', 502),
      );
  }
}

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

// authz: service
// rate-limit: exempt — bearer-secret service auth, not an IP-keyed public surface.
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
        expiresAt: result.expiresAt,
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

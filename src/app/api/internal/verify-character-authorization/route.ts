import { checkCharacterAuthorizations } from '@/composition/character-authorization';
import { checkBearerSecret } from '@/lib/service-auth';
import { verifyCharacterAuthorizationEndpoint } from '@/platform/auth/api-contract';
import { apiResponse } from '@/transport/api-response';

export const maxDuration = 120;

// authz: service
// input: none
// rate-limit: exempt — bearer-secret service auth and per-character persisted claims.
export async function POST(req: Request): Promise<Response> {
  const auth = await checkBearerSecret(req, 'CONVEX_SERVICE_SECRET');
  if (!auth.ok) {
    return apiResponse(verifyCharacterAuthorizationEndpoint, auth.failure.code === 'not_configured' ? 500 : 401, auth.failure);
  }
  await checkCharacterAuthorizations();
  return apiResponse(verifyCharacterAuthorizationEndpoint, 200, { status: 'checked' });
}

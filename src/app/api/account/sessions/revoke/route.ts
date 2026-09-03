import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { sessionsRevokeEndpoint } from '@/platform/auth/api-contract';
import { revokeUserSessions } from '@/platform/auth/admin-users';
import { checkSession } from '@/platform/auth/route-guards';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { apiResponse } from '@/transport/api-response';

export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.revoke-own-sessions',

    preflight: rateLimitPreflight(
      request,
      { name: 'account-logout-everywhere', perMinute: 10 },
      (failure) => apiResponse(sessionsRevokeEndpoint, 429, failure),
    ),
    authorize: checkSession,
    handle: async ({ session }) => {
      const revoked = await revokeUserSessions(session.user.id);
      return apiResponse(sessionsRevokeEndpoint, 200, { revoked });
    },
  });
}

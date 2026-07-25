import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { sessionsRevokeEndpoint } from '@/platform/auth/api-contract';
import { revokeUserSessions } from '@/platform/auth/admin-users';
import { checkSession } from '@/platform/auth/route-guards';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';

/**
 * POST-only. Log the CALLER out everywhere — revoke all of their sessions. Acts on
 * session.user.id only. Note: with the session cookie cache on, an already-issued
 * cookie can keep a tab "signed in" until it next revalidates against the now-missing
 * row, so revocation isn't instantaneous (see revokeUserSessions).
 * No user input — acts on the session user only (never a body-supplied id).
 */
// authz: auth
// input: none
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.revoke-own-sessions',
    // Runs as the shell's preflight, keeping its position ahead of identity
    // while placing the 429 inside the capability scope so it is recorded.
    preflight: async () => {
      const limit = await checkRateLimit(request, {
        name: 'account-logout-everywhere',
        perMinute: 10,
      });
      return limit.ok ? null : apiResponse(sessionsRevokeEndpoint, 429, limit.failure);
    },
    authorize: checkSession,
    handle: async ({ session }) => {
      const revoked = await revokeUserSessions(session.user.id);
      return apiResponse(sessionsRevokeEndpoint, 200, { revoked });
    },
  });
}

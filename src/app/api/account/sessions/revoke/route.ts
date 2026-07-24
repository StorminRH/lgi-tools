import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import type { SessionsRevokeResponse } from '@/platform/auth/api-contract';
import { revokeUserSessions } from '@/platform/auth/admin-users';
import { requireSession } from '@/platform/auth/route-guards';
import { rateLimitGuard } from '@/lib/rate-limit';

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
  const limit = await rateLimitGuard(request, {
    name: 'account-logout-everywhere',
    perMinute: 10,
  });
  if (!limit.ok) return limit.response;

  return runMutationRoute(request, {
    authorize: requireSession,
    handle: async ({ session }) => {
      const revoked = await revokeUserSessions(session.user.id);
      return Response.json({ revoked } satisfies SessionsRevokeResponse);
    },
  });
}

import type { NextRequest } from 'next/server';
import type { SessionsRevokeResponse } from '@/features/auth/api-contract';
import { revokeUserSessions } from '@/features/auth/queries';
import { requireSession } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import { rateLimitGuard } from '@/lib/rate-limit';

// POST-only. Log the CALLER out everywhere — revoke all of their sessions. Acts on
// session.user.id only. Note: with the session cookie cache on, an already-issued
// cookie can keep a tab "signed in" until it next revalidates against the now-missing
// row, so revocation isn't instantaneous (see revokeUserSessions).
// No user input — acts on the session user only (never a body-supplied id).
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  const limit = await rateLimitGuard(request, {
    name: 'account-logout-everywhere',
    perMinute: 10,
  });
  if (!limit.ok) return limit.response;

  const gate = await requireSession();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);
  const session = gate.session;

  const revoked = await revokeUserSessions(session.user.id);

  return Response.json({ revoked } satisfies SessionsRevokeResponse);
}

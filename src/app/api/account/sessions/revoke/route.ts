import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { SessionsRevokeResponse } from '@/features/auth/api-contract';
import { auth } from '@/features/auth/auth';
import { revokeUserSessions } from '@/features/auth/queries';
import { clientIdentifier, rateLimit, type RateLimitedBody } from '@/lib/rate-limit';

// POST-only. Log the CALLER out everywhere — revoke all of their sessions. Acts on
// session.user.id only. Note: with the session cookie cache on, an already-issued
// cookie can keep a tab "signed in" until it next revalidates against the now-missing
// row, so revocation isn't instantaneous (see revokeUserSessions).
// No user input — acts on the session user only (never a body-supplied id).
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'account-logout-everywhere',
    perMinute: 10,
  });
  if (!limit.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: limit.retryAfter } satisfies RateLimitedBody,
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const revoked = await revokeUserSessions(session.user.id);

  return Response.json({ revoked } satisfies SessionsRevokeResponse);
}

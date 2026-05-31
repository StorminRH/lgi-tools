import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/features/auth/cookies';
import { getSession } from '@/features/auth/session';
import { logUsageEvent } from '@/data/telemetry/queries';

// POST-only on purpose — prevents accidental logout via link prefetch.
// The LoginButton submits a small <form method="POST"> here.
// No user input — session read from cookie, response is a redirect.
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  // Capture the session before clearing the cookie so we can attribute the
  // logout event to the right character. Logged-out callers (idempotent
  // double-click on the form) just log with a null actor.
  const session = await getSession();

  const jar = await cookies();
  jar.delete(SESSION_COOKIE);

  void logUsageEvent({
    action: 'auth_logout',
    characterId: session?.characterId ?? null,
    metadata: {},
  }).catch((err) => console.error('[auth/logout] telemetry write failed', err));

  return Response.redirect(new URL('/', request.url), 302);
}

import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import type { AccountDeleteResponse } from '@/features/auth/api-contract';
import { auth } from '@/features/auth/auth';
import { nukeAccount } from '@/features/auth/queries';
import { clientIdentifier, rateLimit, type RateLimitedBody } from '@/lib/rate-limit';

// POST-only. Nuke the CALLER's entire account — every linked character's derived
// data scrubbed, each EVE grant revoked, then the user row deleted (its sessions,
// preferences, and custom structures cascade). The most destructive self-service
// control; the account-page UI confirm-gates it.
// No user input — acts on the session user only (never a body-supplied id).
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'account-delete',
    perMinute: 5,
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

  await nukeAccount(session.user.id);

  // Identity-free purge counter (D-6) — deliberately carries NO user/character id.
  void logUsageEvent({
    action: 'account_purge',
    metadata: { scope: 'account' },
  }).catch((err) => console.error('[account/delete] telemetry write failed', err));

  return Response.json({ ok: true } satisfies AccountDeleteResponse);
}

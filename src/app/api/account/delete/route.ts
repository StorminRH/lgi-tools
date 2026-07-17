import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import type { AccountDeleteResponse } from '@/features/auth/api-contract';
import { nukeAccount } from '@/features/auth/account-purge';
import { requireSession } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import { rateLimitGuard } from '@/lib/rate-limit';

/**
 * POST-only. Nuke the CALLER's entire account — every linked character's derived
 * data scrubbed, each EVE grant revoked, then the user row deleted (its sessions,
 * preferences, and custom structures cascade). The most destructive self-service
 * control; the account-page UI confirm-gates it.
 * No user input — acts on the session user only (never a body-supplied id).
 */
// authz: auth
// input: none
export async function POST(request: NextRequest): Promise<Response> {
  const limit = await rateLimitGuard(request, { name: 'account-delete', perMinute: 5 });
  if (!limit.ok) return limit.response;

  const gate = await requireSession();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);
  const session = gate.session;

  await nukeAccount(session.user.id);

  // Identity-free purge counter (D-6) — deliberately carries NO user/character id.
  void logUsageEvent({
    action: 'account_purge',
    metadata: { scope: 'account' },
  }).catch((err) => console.error('[account/delete] telemetry write failed', err));

  return Response.json({ ok: true } satisfies AccountDeleteResponse);
}

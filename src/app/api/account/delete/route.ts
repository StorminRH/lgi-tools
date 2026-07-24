import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { accountDeleteEndpoint } from '@/platform/auth/api-contract';
import '@/composition/account-lifecycle/register-owner-reconciler';
import { nukeAccount } from '@/composition/account-lifecycle/account-purge';
import { checkSession } from '@/platform/auth/route-guards';
import { requireSameOrigin } from '@/platform/auth/same-origin';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';

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
  const limit = await checkRateLimit(request, {
    name: 'account-delete',
    perMinute: 5,
  });
  if (!limit.ok) {
    return apiResponse(accountDeleteEndpoint, 429, limit.failure);
  }

  const gate = await checkSession();
  if (!gate.ok) {
    return apiResponse(accountDeleteEndpoint, 401, gate.failure);
  }
  requireSameOrigin(request);
  const session = gate.session;

  await nukeAccount(session.user.id);

  // Identity-free purge counter (D-6) — deliberately carries NO user/character id.
  void logUsageEvent({
    action: 'account_purge',
    metadata: { scope: 'account' },
  }).catch((err) => console.error('[account/delete] telemetry write failed', err));

  return apiResponse(accountDeleteEndpoint, 200, { ok: true });
}

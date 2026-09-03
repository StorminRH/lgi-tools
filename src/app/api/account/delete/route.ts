import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { accountDeleteEndpoint } from '@/platform/auth/api-contract';
import '@/composition/account-lifecycle/register-owner-reconciler';
import { nukeAccount } from '@/composition/account-lifecycle/account-purge';
import { checkSession } from '@/platform/auth/route-guards';
import { requireSameOrigin } from '@/platform/auth/same-origin';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export const POST = capabilityRoute('account.delete-account', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
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
  const originCheck = requireSameOrigin(request);
  if (!originCheck.ok) {
    return apiResponse(accountDeleteEndpoint, 403, originCheck.failure);
  }
  const session = gate.session;

  await nukeAccount(session.user.id);

  void logUsageEvent({
    action: 'account_purge',
    metadata: { scope: 'account' },
  }).catch((err) => console.error('[account/delete] telemetry write failed', err));

  return apiResponse(accountDeleteEndpoint, 200, { ok: true });
}

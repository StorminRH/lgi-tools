import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { logUsageEvent } from '@/data/telemetry/queries';
import { accountDeleteEndpoint } from '@/platform/auth/api-contract';
import { nukeAccount } from '@/composition/account-lifecycle/account-purge';
import { checkSession } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.delete-account',
    endpoint: accountDeleteEndpoint,
    preflight: rateLimitPreflight(
      request,
      { name: 'account-delete', perMinute: 5 },
      (failure) => apiResponse(accountDeleteEndpoint, 429, failure),
    ),
    authorize: checkSession,
    handle: async ({ session }) => {
      await nukeAccount(session.user.id);

      void logUsageEvent({
        action: 'account_purge',
        metadata: { scope: 'account' },
      }).catch((err) => console.error('[account/delete] telemetry write failed', err));

      return apiResponse(accountDeleteEndpoint, 200, { ok: true });
    },
  });
}

import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { emitUsageEvent } from '@/data/telemetry/usage-events';
import {
  purgeCharacterEndpoint,
  purgeCharacterRequestSchema,
} from '@/platform/auth/api-contract';
import { accountBelongsToUser, notLinkedFailure } from '@/platform/auth/linked-characters';
import { purgeOwnCharacter } from '@/composition/account-lifecycle/account-purge';
import { validationFailure } from '@/lib/failure';
import { checkSession } from '@/composition/route-guards';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.purge-character',
    endpoint: purgeCharacterEndpoint,
    preflight: rateLimitPreflight(
      request,
      { name: 'account-purge-character', perMinute: 10 },
      (failure) => apiResponse(purgeCharacterEndpoint, 429, failure),
    ),
    authorize: checkSession,
    parse: async (incoming) => {
      const parsed = await readJsonBody(incoming, purgeCharacterRequestSchema);
      return parsed.ok
        ? parsed
        : {
            ok: false,
            failure: validationFailure(
              parsed.failure.code,
              'Invalid character',
            ),
          };
    },
    handle: async ({ session }, { characterId }) => {
      if (!(await accountBelongsToUser(session.user.id, characterId))) {
        return apiResponse(purgeCharacterEndpoint, 400, notLinkedFailure());
      }

      const result = await purgeOwnCharacter(session.user.id, characterId);

      emitUsageEvent('account/purge-character', {
        action: 'account_purge',
        metadata: { scope: 'character' },
      });

      return apiResponse(purgeCharacterEndpoint, 200, result);
    },
  });
}

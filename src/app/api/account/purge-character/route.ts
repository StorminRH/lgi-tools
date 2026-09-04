import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import {
  purgeCharacterEndpoint,
  purgeCharacterRequestSchema,
} from '@/platform/auth/api-contract';
import { accountBelongsToUser } from '@/platform/auth/linked-characters';
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
        return apiResponse(
          purgeCharacterEndpoint,
          400,
          validationFailure(
            'not_linked',
            'Character not linked to your account',
          ),
        );
      }

      const result = await purgeOwnCharacter(session.user.id, characterId);

      void logUsageEvent({
        action: 'account_purge',
        metadata: { scope: 'character' },
      }).catch((err) => console.error('[account/purge-character] telemetry write failed', err));

      return apiResponse(purgeCharacterEndpoint, 200, result);
    },
  });
}

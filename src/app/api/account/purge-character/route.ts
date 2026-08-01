import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import {
  purgeCharacterEndpoint,
  purgeCharacterRequestSchema,
} from '@/platform/auth/api-contract';
import { accountBelongsToUser } from '@/platform/auth/linked-characters';
import '@/composition/account-lifecycle/register-owner-reconciler';
import '@/composition/map-access-identity';
import { purgeOwnCharacter } from '@/composition/account-lifecycle/account-purge';
import { validationFailure } from '@/lib/failure';
import { checkSession } from '@/platform/auth/route-guards';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * POST-only. Purge one of the CALLER's OWN linked characters — the destructive
 * counterpart to unlink: it scrubs all of the character's derived data and revokes
 * its EVE grant upstream (unlink only detaches). Returns \{ accountEmptied \} so the
 * UI knows whether purging the last character emptied (and deleted) the account.
 * Acts on session.user.id only; the ownership check guards the posted character id.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.purge-character',
    // Per-IP rate limit, still checked before the session read so a flood is
    // rejected at the cheapest point. A purge is a rare, deliberate action —
    // 10/min is generous. Runs as the shell's preflight so a 429 is recorded.
    preflight: async () => {
      const limit = await checkRateLimit(request, {
        name: 'account-purge-character',
        perMinute: 10,
      });
      return limit.ok ? null : apiResponse(purgeCharacterEndpoint, 429, limit.failure);
    },
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
      // The security-critical line: never trust the posted id. Only purge among the
      // user's own linked characters.
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

      // Identity-free purge counter (D-6) — deliberately carries NO character id.
      void logUsageEvent({
        action: 'account_purge',
        metadata: { scope: 'character' },
      }).catch((err) => console.error('[account/purge-character] telemetry write failed', err));

      return apiResponse(purgeCharacterEndpoint, 200, result);
    },
  });
}

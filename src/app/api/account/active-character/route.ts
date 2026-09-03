import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { checkRateLimit } from '@/lib/rate-limit';
import { switchCharacterFormSchema } from '@/platform/auth/api-contract';
import { accountBelongsToUser, setActiveCharacter } from '@/platform/auth/linked-characters';
import { checkSession } from '@/platform/auth/route-guards';
import { parseFormBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.switch-active-character',
    preflight: async () => {
      const limit = await checkRateLimit(request, { name: 'account-switch', perMinute: 30 });
      return limit.ok ? null : problemResponse(limit.failure);
    },
    authorize: checkSession,
    parse: (incoming) => parseFormBody(
      incoming,
      switchCharacterFormSchema,
      (form) => ({ characterId: form.get('characterId') }),
      () => validationFailure('invalid_form_field', 'Invalid character'),
    ),
    handle: async ({ session }, { characterId }) => {
      if (!(await accountBelongsToUser(session.user.id, characterId))) {
        return problemResponse(
          validationFailure(
            'not_linked',
            'Character not linked to your account',
          ),
        );
      }

      await setActiveCharacter(session.user.id, characterId);

      void logUsageEvent({
        action: 'character_switch',
        characterId: session.characterId,
        metadata: { userId: session.user.id, toCharacterId: characterId },
      }).catch((err) => console.error('[account/active-character] telemetry write failed', err));

      return Response.redirect(new URL('/characters', request.url), 303);
    },
  });
}

import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { validationFailure } from '@/lib/failure';
import { problemResponse } from '@/lib/problem';
import { checkRateLimit } from '@/lib/rate-limit';
import { switchCharacterFormSchema } from '@/platform/auth/api-contract';
import { accountBelongsToUser, setActiveCharacter } from '@/platform/auth/linked-characters';
import { checkSession } from '@/platform/auth/route-guards';
import { parseFormBody } from '@/transport/route-body';

/**
 * POST-only. Sets the signed-in pilot's active character. Any authenticated user
 * may switch among THEIR OWN linked characters — the ownership check is the real
 * guard (a crafted POST can name any id; the UI-level row is just convenience).
 * Mirrors /api/admin/role: Zod-validated form, fire-and-forget telemetry, 303.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  // Per-IP rate limit, checked before the session read so a flood is rejected
  // at the cheapest point. Every accepted switch writes the DB; 30/min covers
  // any real pilot flipping characters and cuts a scripted loop off fast.
  const limit = await checkRateLimit(request, { name: 'account-switch', perMinute: 30 });
  if (!limit.ok) return problemResponse(limit.failure);

  return runMutationRoute(request, {
    authorize: checkSession,
    parse: (incoming) => parseFormBody(
      incoming,
      switchCharacterFormSchema,
      (form) => ({ characterId: form.get('characterId') }),
      () => validationFailure('invalid_form_field', 'Invalid character'),
    ),
    handle: async ({ session }, { characterId }) => {
      // The security-critical line: never trust the posted id. Only switch among the
      // user's own linked characters.
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

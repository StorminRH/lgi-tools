import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { validationFailure } from '@/lib/failure';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { problemResponse } from '@/transport/api-response';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { unlinkCharacterFormSchema } from '@/platform/auth/api-contract';
import { auth } from '@/composition/auth';
import { EVE_PROVIDER_ID } from '@/platform/auth/eve-sso-constants';
import {
  getStoredActiveCharacterId,
  listLinkedCharacters,
  repointActiveToOldest,
} from '@/platform/auth/linked-characters';
import { checkSession } from '@/composition/route-guards';
import { parseFormBody } from '@/transport/route-body';

function redirectWithError(request: NextRequest, code: string): Response {
  const url = new URL('/characters', request.url);
  url.searchParams.set('error', code);
  return Response.redirect(url, 303);
}

/**
 * POST-only. Removes one of the signed-in pilot's linked EVE characters (and its
 * stored encrypted tokens — deleteAccount drops the row). We pre-check ownership
 * and the last-character guard ourselves for clean error copy; Better Auth's
 * unlink also enforces both as a backstop. If the removed character was active,
 * the active pointer is re-aimed at the oldest remaining one so the session never
 * references a deleted account.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.unlink-character',
    // Per-IP rate limit, still checked before the session read so a flood is
    // rejected at the cheapest point. Unlinking is rare and deliberate — 10/min
    // is plenty for a human and stops scripted hammering of the unlink + token
    // deletion. Runs as the shell's preflight so a 429 is recorded.
    preflight: rateLimitPreflight(
      request,
      { name: 'account-unlink', perMinute: 10 },
      problemResponse,
    ),
    authorize: checkSession,
    parse: (incoming) => parseFormBody(
      incoming,
      unlinkCharacterFormSchema,
      (form) => ({ characterId: form.get('characterId') }),
      () => validationFailure('invalid_form_field', 'Invalid character'),
    ),
    handle: async ({ session }, { characterId }) => {
      const linked = await listLinkedCharacters(session.user.id);
      if (!linked.some((c) => c.characterId === characterId)) {
        return redirectWithError(request, 'not_linked');
      }
      // Can't remove the only character — there'd be no identity left to act as.
      if (linked.length <= 1) {
        return redirectWithError(request, 'last_character');
      }

      try {
        await auth.api.unlinkAccount({
          body: { providerId: EVE_PROVIDER_ID, accountId: String(characterId) },
          headers: await headers(),
        });
      } catch (err) {
        console.error('[account/unlink] unlinkAccount failed', err);
        return redirectWithError(request, 'unlink_failed');
      }

      // Better Auth unlink does not go through deleteLinkedCharacter; re-project
      // via the never-throw identity hook runner so a Neon enumeration blip
      // cannot 500 a committed unlink or skip the active-pointer repoint.
      await identityProjectionRunners.runAfterCharacterLinkChanged({
        userId: session.user.id,
        characterId,
      });

      // Re-point the active character if we just removed it (the oldest remaining one
      // becomes active). Read the stored active id FRESH rather than trusting the
      // session snapshot, which a concurrent switch could have made stale. Safe
      // because the last-character guard above guarantees at least one account remains.
      const activeCharacterId = await getStoredActiveCharacterId(session.user.id);
      if (activeCharacterId === characterId) {
        await repointActiveToOldest(session.user.id);
      }

      void logUsageEvent({
        action: 'character_unlink',
        characterId: session.characterId,
        metadata: { userId: session.user.id, unlinkedCharacterId: characterId },
      }).catch((err) => console.error('[account/unlink] telemetry write failed', err));

      return Response.redirect(new URL('/characters', request.url), 303);
    },
  });
}

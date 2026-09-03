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
import { checkSession } from '@/platform/auth/route-guards';
import { parseFormBody } from '@/transport/route-body';

function redirectWithError(request: NextRequest, code: string): Response {
  const url = new URL('/characters', request.url);
  url.searchParams.set('error', code);
  return Response.redirect(url, 303);
}

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.unlink-character',
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

      await identityProjectionRunners.runAfterCharacterLinkChanged({
        userId: session.user.id,
        characterId,
      });

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

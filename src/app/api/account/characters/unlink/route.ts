import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { unexpectedFailure, validationFailure, type AppFailure } from '@/lib/failure';
import { problemResponse, seeOther } from '@/transport/api-response';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { characterIdFormSchema, type CharacterLinkNotice } from '@/platform/auth/api-contract';
import { auth } from '@/composition/auth';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { unlinkCharacter } from '@/platform/auth/character-unlink';
import { listLinkedCharacters, notLinkedFailure } from '@/platform/auth/linked-characters';
import { checkSession } from '@/composition/route-guards';
import { parseFormBody } from '@/transport/route-body';

const CHARACTERS_PAGE = '/settings/characters';

const UNLINK_FAILURE_LOGS = {
  'revocation-failed': '[account/unlink] map access revocation failed',
  'remove-failed': '[account/unlink] unlinkAccount failed',
} as const;

/** Back to the characters page with the notice for `error`, recording `failure`. */
function notice(request: Request, error: CharacterLinkNotice, failure: AppFailure): Response {
  return seeOther(request, CHARACTERS_PAGE, { query: { error }, failure });
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
    parse: (incoming) =>
      parseFormBody(incoming, characterIdFormSchema, ['characterId']),
    handle: async ({ session }, { characterId }) => {
      const linked = await listLinkedCharacters(session.user.id);
      if (!linked.some((c) => c.characterId === characterId)) {
        return notice(request, 'not_linked', notLinkedFailure());
      }
      if (linked.length <= 1) {
        return notice(request, 'last_character', validationFailure('last_character'));
      }

      const outcome = await unlinkCharacter({
        userId: session.user.id,
        characterId,
        runners: identityProjectionRunners,
        remove: async () => {
          await auth.api.unlinkAccount({
            body: { providerId: EVE_PROVIDER_ID, accountId: String(characterId) },
            headers: await headers(),
          });
          return true;
        },
      });
      if ('error' in outcome) {
        console.error(UNLINK_FAILURE_LOGS[outcome.reason], outcome.error);
        return notice(request, 'unlink_failed', unexpectedFailure('unlink_failed', outcome.error));
      }

      void logUsageEvent({
        action: 'character_unlink',
        characterId: session.characterId,
        metadata: { userId: session.user.id, unlinkedCharacterId: characterId },
      }).catch((err) => console.error('[account/unlink] telemetry write failed', err));

      return seeOther(request, CHARACTERS_PAGE);
    },
  });
}

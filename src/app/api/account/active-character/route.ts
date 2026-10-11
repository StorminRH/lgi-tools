import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { problemResponse, seeOther } from '@/transport/api-response';
import { switchCharacterFormSchema, type CharacterLinkNotice } from '@/platform/auth/api-contract';
import { notLinkedFailure, setActiveCharacter } from '@/platform/auth/linked-characters';
import { checkSession } from '@/composition/route-guards';
import { parseFormBody } from '@/transport/route-body';

const CHARACTERS_PAGE = '/settings/characters';

// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'account.switch-active-character',
    preflight: rateLimitPreflight(
      request,
      { name: 'account-switch', perMinute: 30 },
      problemResponse,
    ),
    authorize: checkSession,
    parse: (incoming) =>
      parseFormBody(incoming, switchCharacterFormSchema, ['characterId']),
    handle: async ({ session }, { characterId }) => {
      if (!(await setActiveCharacter(session.user.id, characterId))) {
        // The switch form posts natively, so the refusal is a notice on the page.
        return seeOther(request, CHARACTERS_PAGE, {
          query: { error: 'not_linked' satisfies CharacterLinkNotice },
          failure: notLinkedFailure(),
        });
      }

      void logUsageEvent({
        action: 'character_switch',
        characterId: session.characterId,
        metadata: { userId: session.user.id, toCharacterId: characterId },
      }).catch((err) => console.error('[account/active-character] telemetry write failed', err));

      return seeOther(request, CHARACTERS_PAGE);
    },
  });
}

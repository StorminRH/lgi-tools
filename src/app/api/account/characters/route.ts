// authz: auth
// input: none
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { toAccountCharacter } from '@/platform/auth/panel-character';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { getCurrentUserId } from '@/composition/session';
import { LOCATION_SYNC_SCOPES } from '@/data/location-tracking/sync-eligibility';
import { SKILL_SYNC_SCOPES } from '@/features/skill-queue/sync-eligibility';
import { apiResponse } from '@/transport/api-response';

export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(accountCharactersEndpoint, 200, { characters: [] });
  }

  const linked = await listLinkedCharacters(userId);
  return apiResponse(accountCharactersEndpoint, 200, {
    characters: linked.map((character) =>
      toAccountCharacter(character, {
        skillQueue: SKILL_SYNC_SCOPES,
        location: LOCATION_SYNC_SCOPES,
      }),
    ),
  });
}

// authz: auth
// input: none
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { toAccountCharacter } from '@/platform/auth/panel-character';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { getCurrentUserId } from '@/composition/session';
import { canSyncLocation } from '@/data/location-tracking/sync-eligibility';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
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
        skillQueue: canSyncSkillQueue,
        location: canSyncLocation,
      }),
    ),
  });
}

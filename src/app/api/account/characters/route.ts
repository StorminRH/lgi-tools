// authz: auth
// input: none
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { toPanelCharacter } from '@/platform/auth/panel-character';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { getCurrentUserId } from '@/platform/auth/session';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
import { apiResponse } from '@/transport/api-response';

export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(accountCharactersEndpoint, 200, { characters: [] });
  }

  const linked = await listLinkedCharacters(userId);
  return apiResponse(accountCharactersEndpoint, 200, {
    characters: linked.map((character) => toPanelCharacter(character, canSyncSkillQueue)),
  });
}

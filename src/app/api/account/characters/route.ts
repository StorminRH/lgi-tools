// GET /api/account/characters
// The signed-in caller's own linked EVE characters — the client-safe projection
// the home roster (P3b) renders (name, portrait, skill-sync reconnect health),
// joined client-side with the live Convex skill sync. Scoped to the authenticated
// caller; anonymous → empty list (the roster only mounts for a signed-in pilot).
// No token material, no raw scope string. No user input to validate.
// authz: auth
// input: none
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { toPanelCharacter } from '@/platform/auth/panel-character';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { getCurrentUserId } from '@/composition/session';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
import { apiResponse } from '@/transport/api-response';

/**
 * Handles GET requests for /api/account/characters; this route owns its authorization, boundary
 * validation, and typed response mapping.
 */
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

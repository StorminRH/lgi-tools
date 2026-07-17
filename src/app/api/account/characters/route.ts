// GET /api/account/characters
// The signed-in caller's own linked EVE characters — the client-safe projection
// the home roster (P3b) renders (name, portrait, skill-sync reconnect health),
// joined client-side with the live Convex skill sync. Scoped to the authenticated
// caller; anonymous → empty list (the roster only mounts for a signed-in pilot).
// No token material, no raw scope string. No user input to validate.
// authz: auth
import type { AccountCharactersResponse } from '@/features/auth/api-contract';
import { toPanelCharacter } from '@/features/auth/panel-character';
import { listLinkedCharacters } from '@/features/auth/linked-characters';
import { getCurrentUserId } from '@/features/auth/session';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';

/**
 * Handles GET requests for /api/account/characters; this route owns its authorization, boundary
 * validation, and typed response mapping.
 */
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ characters: [] } satisfies AccountCharactersResponse);
  }

  const linked = await listLinkedCharacters(userId);
  return Response.json({
    characters: linked.map((character) => toPanelCharacter(character, canSyncSkillQueue)),
  } satisfies AccountCharactersResponse);
}

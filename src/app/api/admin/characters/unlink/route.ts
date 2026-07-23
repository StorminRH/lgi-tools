import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { adminUnlinkFormSchema } from '@/platform/auth/api-contract';
import { requireAdmin } from '@/platform/auth/route-guards';
import { parseFormBody } from '@/transport/route-body';
import {
  accountBelongsToUser,
  getStoredActiveCharacterId,
  listLinkedCharacters,
  repointActiveToOldest,
} from '@/platform/auth/linked-characters';
import { deleteLinkedCharacter } from '@/platform/auth/admin-users';

function redirectTo(request: NextRequest, userId: string, error?: string): Response {
  const url = new URL(`/admin/access/${userId}`, request.url);
  if (error) url.searchParams.set('error', error);
  return Response.redirect(url, 303);
}

/**
 * POST-only. Admin force-unlinks one EVE character from ANY user (and its stored
 * encrypted tokens — deleting the account row drops them). Unlike the
 * self-service route this can't use auth.api.unlinkAccount (that only targets
 * the caller's own user), so it's a direct DB delete guarded here. We refuse the
 * user's LAST character — that would orphan the account; reassign is the path for
 * a single-character standalone account. If the removed character was the user's
 * active one, the active pointer is re-aimed at the oldest remaining account.
 * Independent gate — never trust a UI-level disable.
 */
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireAdmin,
    parse: (incoming) =>
      parseFormBody(
        incoming,
        adminUnlinkFormSchema,
        (form) => ({ userId: form.get('userId'), characterId: form.get('characterId') }),
        () => new Response('Invalid form', { status: 400 }),
      ),
    handle: async ({ session }, { userId, characterId }) => {
      if (!(await accountBelongsToUser(userId, characterId))) {
        return new Response('Character not linked to that user', { status: 404 });
      }

      // Don't strand a user with no identity — reassign instead. (The button is
      // disabled in this case, but a crafted POST would still arrive here.)
      const linked = await listLinkedCharacters(userId);
      if (linked.length <= 1) {
        return redirectTo(request, userId, 'last_character');
      }

      const removed = await deleteLinkedCharacter(userId, characterId);
      if (!removed) {
        return redirectTo(request, userId, 'unlink_failed');
      }

      // Re-point the target user's active character if we just removed it. At least
      // one account remains (last-character guard above).
      const active = await getStoredActiveCharacterId(userId);
      if (active === characterId) {
        await repointActiveToOldest(userId);
      }

      void logUsageEvent({
        action: 'admin_character_unlink',
        characterId: session.characterId,
        metadata: {
          actorUserId: session.user.id,
          targetUserId: userId,
          characterId,
        },
      }).catch((err) => console.error('[admin/characters/unlink] telemetry write failed', err));

      return redirectTo(request, userId);
    },
  });
}

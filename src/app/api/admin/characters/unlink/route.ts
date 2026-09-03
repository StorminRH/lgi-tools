import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import '@/composition/map-access-identity';
import { logUsageEvent } from '@/data/telemetry/queries';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { adminUnlinkFormSchema } from '@/platform/auth/api-contract';
import { checkAdmin } from '@/platform/auth/route-guards';
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

export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.unlink-character',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(
        incoming,
        adminUnlinkFormSchema,
        (form) => ({ userId: form.get('userId'), characterId: form.get('characterId') }),
        () => validationFailure('invalid_form_field', 'Invalid form'),
      ),
    handle: async ({ session }, { userId, characterId }) => {
      if (!(await accountBelongsToUser(userId, characterId))) {
        return problemResponse(
          notFoundFailure(
            'not_linked',
            'Character not linked to that user',
          ),
        );
      }

      const linked = await listLinkedCharacters(userId);
      if (linked.length <= 1) {
        return redirectTo(request, userId, 'last_character');
      }

      const removed = await deleteLinkedCharacter(userId, characterId);
      if (!removed) {
        return redirectTo(request, userId, 'unlink_failed');
      }

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

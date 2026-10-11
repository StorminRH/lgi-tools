import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { logUsageEvent } from '@/data/telemetry/queries';
import { conflictFailure, notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse, seeOther } from '@/transport/api-response';
import { adminUnlinkFormSchema } from '@/platform/auth/api-contract';
import { checkAdmin } from '@/composition/route-guards';
import { parseFormBody } from '@/transport/route-body';
import {
  accountBelongsToUser,
  listLinkedCharacters,
} from '@/platform/auth/linked-characters';
import { deleteLinkedCharacter } from '@/platform/auth/admin-users';

// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.unlink-character',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(incoming, adminUnlinkFormSchema, ['userId', 'characterId']),
    handle: async ({ session }, { userId, characterId }) => {
      if (!(await accountBelongsToUser(userId, characterId))) {
        return problemResponse(
          notFoundFailure(
            'not_linked',
            'Character not linked to that user',
          ),
        );
      }

      const userPage = `/admin/users/${userId}`;
      const linked = await listLinkedCharacters(userId);
      if (linked.length <= 1) {
        return seeOther(request, userPage, {
          query: { error: 'last_character' },
          failure: validationFailure('last_character'),
        });
      }

      const removed = await deleteLinkedCharacter(userId, characterId, identityProjectionRunners);
      if (!removed) {
        return seeOther(request, userPage, {
          query: { error: 'unlink_failed' },
          failure: conflictFailure('unlink_failed'),
        });
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

      return seeOther(request, userPage);
    },
  });
}

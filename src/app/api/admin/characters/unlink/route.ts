import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { logUsageEvent } from '@/data/telemetry/queries';
import {
  conflictFailure,
  notFoundFailure,
  validationFailure,
  type AppFailure,
} from '@/lib/failure';
import { seeOther } from '@/transport/api-response';
import { adminUnlinkFormSchema, type CharacterLinkNotice } from '@/platform/auth/api-contract';
import { checkAdmin } from '@/composition/route-guards';
import { parseFormBody } from '@/transport/route-body';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deleteLinkedCharacter } from '@/platform/auth/admin-users';

// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.unlink-character',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(incoming, adminUnlinkFormSchema, ['userId', 'characterId']),
    handle: async ({ session }, { userId, characterId }) => {
      const userPage = `/admin/users/${userId}`;
      const notice = (error: CharacterLinkNotice, failure: AppFailure) =>
        seeOther(request, userPage, { query: { error }, failure });

      const linked = await listLinkedCharacters(userId);
      if (!linked.some((c) => c.characterId === characterId)) {
        return notice('not_linked', notFoundFailure('not_linked', 'Character not linked to that user'));
      }
      if (linked.length <= 1) {
        return notice('last_character', validationFailure('last_character'));
      }

      const removed = await deleteLinkedCharacter(userId, characterId, identityProjectionRunners);
      if (!removed) {
        return notice('unlink_failed', conflictFailure('unlink_failed'));
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

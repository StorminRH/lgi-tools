import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { checkAdmin } from '@/composition/route-guards';
import { emitUsageEvent } from '@/data/telemetry/usage-events';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse, seeOther } from '@/transport/api-response';
import { adminReassignFormSchema } from '@/platform/auth/api-contract';
import { accountBelongsToUser } from '@/platform/auth/linked-characters';
import { reassignCharacter } from '@/platform/auth/admin-users';
import { parseFormBody } from '@/transport/route-body';

// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.reassign-character',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(incoming, adminReassignFormSchema, ['characterId', 'fromUserId']),
    handle: async ({ session }, { characterId, fromUserId }) => {
      const toUserId = session.user.id;
      if (fromUserId === toUserId) {
        return problemResponse(
          validationFailure(
            'already_linked',
            'Character is already on your account',
          ),
        );
      }

      if (!(await accountBelongsToUser(fromUserId, characterId))) {
        return problemResponse(
          notFoundFailure('not_linked', 'Character not linked to that user'),
        );
      }

      const { sourceDeleted } = await reassignCharacter({
        characterId,
        fromUserId,
        toUserId,
        runners: identityProjectionRunners,
      });

      emitUsageEvent('admin/characters/reassign', {
        action: 'admin_character_reassign',
        characterId: session.characterId,
        metadata: {
          actorUserId: toUserId,
          targetUserId: fromUserId,
          characterId,
          sourceDeleted,
        },
      });

      return seeOther(request, `/admin/users/${toUserId}`);
    },
  });
}

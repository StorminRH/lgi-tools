import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { emitUsageEvent } from '@/data/telemetry/usage-events';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse, seeOther } from '@/transport/api-response';
import { adminRevokeSessionsFormSchema } from '@/platform/auth/api-contract';
import { getUserById, revokeUserSessions } from '@/platform/auth/admin-users';
import { checkAdmin } from '@/composition/route-guards';
import { parseFormBody } from '@/transport/route-body';

// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.revoke-user-sessions',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(incoming, adminRevokeSessionsFormSchema, ['userId']),
    handle: async ({ session }, { userId }) => {
      if (userId === session.user.id) {
        return problemResponse(
          validationFailure(
            'self_session',
            'Cannot force-logout your own session',
          ),
        );
      }

      const target = await getUserById(userId);
      if (!target) {
        return problemResponse(
          notFoundFailure('user_not_found', 'User not found'),
        );
      }

      const revoked = await revokeUserSessions(userId);

      emitUsageEvent('admin/sessions/revoke', {
        action: 'admin_force_logout',
        characterId: session.characterId,
        metadata: {
          actorUserId: session.user.id,
          targetUserId: userId,
          targetCharacterId: target.characterId,
          sessionsRevoked: revoked,
        },
      });

      return seeOther(request, `/admin/users/${userId}`);
    },
  });
}

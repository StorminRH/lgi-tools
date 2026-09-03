import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { adminRevokeSessionsFormSchema } from '@/platform/auth/api-contract';
import { getUserById, revokeUserSessions } from '@/platform/auth/admin-users';
import { checkAdmin } from '@/platform/auth/route-guards';
import { parseFormBody } from '@/transport/route-body';

export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.revoke-user-sessions',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(
        incoming,
        adminRevokeSessionsFormSchema,
        (form) => ({ userId: form.get('userId') }),
        () => validationFailure('invalid_form_field', 'Invalid form'),
      ),
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

      void logUsageEvent({
        action: 'admin_force_logout',
        characterId: session.characterId,
        metadata: {
          actorUserId: session.user.id,
          targetUserId: userId,
          targetCharacterId: target.characterId,
          sessionsRevoked: revoked,
        },
      }).catch((err) => console.error('[admin/sessions/revoke] telemetry write failed', err));

      return Response.redirect(new URL(`/admin/access/${userId}`, request.url), 303);
    },
  });
}

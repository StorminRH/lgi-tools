import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse, seeOther } from '@/transport/api-response';
import {
  adminRoleFormSchema,
  sanitiseAdminAccessQuery,
} from '@/platform/auth/api-contract';
import { getUserById, setUserRole } from '@/platform/auth/admin-users';
import { checkAdmin } from '@/composition/route-guards';
import { parseFormBody } from '@/transport/route-body';
import { logUsageEvent } from '@/data/telemetry/queries';

// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.set-user-role',
    authorize: checkAdmin,
    parse: (incoming) =>
      parseFormBody(incoming, adminRoleFormSchema, ['userId', 'nextRole', 'q']),
    handle: async ({ session }, { userId, nextRole, q }) => {
      const viewerUserId = session.user.id;
      if (userId === viewerUserId) {
        return problemResponse(
          validationFailure('self_role', 'Cannot toggle your own role'),
        );
      }

      const target = await getUserById(userId);
      if (!target) {
        return problemResponse(
          notFoundFailure('user_not_found', 'User not found'),
        );
      }

      const previousRole = target.role;
      await setUserRole(userId, nextRole);

      void logUsageEvent({
        action: 'role_change',
        characterId: session.characterId,
        metadata: {
          actorUserId: viewerUserId,
          targetUserId: userId,
          targetCharacterId: target.characterId,
          from: previousRole,
          to: nextRole,
        },
      }).catch((err) => console.error('[admin/role] telemetry write failed', err));

      return seeOther(request, '/admin/users', {
        query: { q: sanitiseAdminAccessQuery(q) },
      });
    },
  });
}

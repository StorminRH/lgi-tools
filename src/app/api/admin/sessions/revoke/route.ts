import type { NextRequest } from 'next/server';
import { runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { adminRevokeSessionsFormSchema } from '@/features/auth/api-contract';
import { getUserById, revokeUserSessions } from '@/features/auth/admin-users';
import { requireAdmin } from '@/features/auth/route-guards';
import { parseFormBody } from '@/lib/route-body';

// POST-only. Admin force-logout: deletes every session row for the target user,
// pushing them to re-authenticate. With the session cookie cache on this isn't
// instantaneous (an issued cookie lingers until it expires). Self is refused —
// an admin logs themselves out via the normal sign-out, not this tool.
// Independent gate — never trust a UI-level disable.
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    authorize: requireAdmin,
    parse: (incoming) =>
      parseFormBody(
        incoming,
        adminRevokeSessionsFormSchema,
        (form) => ({ userId: form.get('userId') }),
        () => new Response('Invalid form', { status: 400 }),
      ),
    handle: async ({ session }, { userId }) => {
      if (userId === session.user.id) {
        return new Response('Cannot force-logout your own session', { status: 400 });
      }

      const target = await getUserById(userId);
      if (!target) {
        return new Response('User not found', { status: 404 });
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

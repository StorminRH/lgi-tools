import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { adminRevokeSessionsFormSchema } from '@/features/auth/api-contract';
import { auth } from '@/features/auth/auth';
import { getUserById, revokeUserSessions } from '@/features/auth/queries';

// POST-only. Admin force-logout: deletes every session row for the target user,
// pushing them to re-authenticate. With the session cookie cache on this isn't
// instantaneous (an issued cookie lingers until it expires). Self is refused —
// an admin logs themselves out via the normal sign-out, not this tool.
// Independent gate — never trust a UI-level disable.
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const parsed = adminRevokeSessionsFormSchema.safeParse({ userId: form.get('userId') });
  if (!parsed.success) {
    return new Response('Invalid form', { status: 400 });
  }
  const { userId } = parsed.data;

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
}

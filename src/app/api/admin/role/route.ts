import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/features/auth/auth';
import { getUserById, setUserRole } from '@/features/auth/queries';
import { CHARACTER_ROLES } from '@/features/auth/schema';
import { logUsageEvent } from '@/data/telemetry/queries';
import { sanitiseUserText } from '@/lib/sanitise';

const MAX_QUERY_LENGTH = 200;

// Form payload from <RoleToggleForm>. `userId` is a Better Auth id (opaque
// string — nanoid for new logins, `eve-user-<id>` for backfilled pilots); the
// charset gate keeps junk out. `q` (optional search-state preserver) is loosely
// validated here — the post-parse sanitiseQuery() does the real cleaning.
const roleFormSchema = z.object({
  userId: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
  nextRole: z.enum(CHARACTER_ROLES),
  q: z.string().max(MAX_QUERY_LENGTH * 4).optional(),
});

function sanitiseQuery(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = sanitiseUserText(raw, MAX_QUERY_LENGTH);
  return cleaned.length === 0 ? undefined : cleaned;
}

function buildRedirect(request: NextRequest, query: string | undefined): URL {
  const url = new URL('/admin', request.url);
  if (query) url.searchParams.set('q', query);
  return url;
}

// POST-only. The dashboard's <RoleToggleForm> submits hidden inputs:
//   userId, nextRole, q (optional).
// Admin is per-user; the gate + the viewer's own id come from the Better Auth
// session directly (the shared Session type deliberately doesn't carry userId).
// Independent gate — never trust a UI-level disable; the handler is the source
// of truth for who can mutate roles.
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    return new Response('Forbidden', { status: 403 });
  }
  const viewerUserId = session.user.id;
  const actorCharacterId = session.characterId;

  const form = await request.formData();
  const parsed = roleFormSchema.safeParse({
    userId: form.get('userId'),
    nextRole: form.get('nextRole'),
    q: form.get('q') ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `Invalid ${issue.path.join('.') || 'field'}` : 'Invalid form';
    return new Response(detail, { status: 400 });
  }
  const { userId, nextRole } = parsed.data;

  // Self-toggle guard. The UI disables this button on the viewer's own row,
  // but a crafted POST would still arrive here — this is the real defense.
  if (userId === viewerUserId) {
    return new Response('Cannot toggle your own role', { status: 400 });
  }

  const target = await getUserById(userId);
  if (!target) {
    return new Response('User not found', { status: 404 });
  }

  const previousRole = target.role;
  await setUserRole(userId, nextRole);

  void logUsageEvent({
    action: 'role_change',
    characterId: actorCharacterId,
    metadata: {
      actorUserId: viewerUserId,
      targetUserId: userId,
      targetCharacterId: target.characterId,
      from: previousRole,
      to: nextRole,
    },
  }).catch((err) => console.error('[admin/role] telemetry write failed', err));

  const query = sanitiseQuery(parsed.data.q);
  return Response.redirect(buildRedirect(request, query), 303);
}

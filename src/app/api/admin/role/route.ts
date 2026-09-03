import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import {
  ADMIN_ACCESS_QUERY_MAX_LENGTH,
  adminRoleFormSchema,
} from '@/platform/auth/api-contract';
import { getUserById, setUserRole } from '@/platform/auth/admin-users';
import { adminMutationGate } from '@/app/api/admin-mutation';
import { parseFormBody } from '@/transport/route-body';
import { logUsageEvent } from '@/data/telemetry/queries';
import { sanitiseUserText } from '@/lib/sanitise';

function sanitiseQuery(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = sanitiseUserText(raw, ADMIN_ACCESS_QUERY_MAX_LENGTH);
  return cleaned.length === 0 ? undefined : cleaned;
}

function buildRedirect(request: NextRequest, query: string | undefined): URL {
  const url = new URL('/admin/access', request.url);
  if (query) url.searchParams.set('q', query);
  return url;
}

// authz: admin
export const POST = capabilityRoute('admin.set-user-role', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const gate = await adminMutationGate(request);
  if (!gate.ok) return gate.response;
  const viewerUserId = gate.session.user.id;
  const actorCharacterId = gate.session.characterId;

  const parsed = await parseFormBody(
    request,
    adminRoleFormSchema,
    (form) => ({
      userId: form.get('userId'),
      nextRole: form.get('nextRole'),
      q: form.get('q') ?? undefined,
    }),
    (error) => {
      const issue = error.issues[0];
      const detail = issue ? `Invalid ${issue.path.join('.') || 'field'}` : 'Invalid form';
      return validationFailure('invalid_form_field', detail);
    },
  );
  if (!parsed.ok) return problemResponse(parsed.failure);
  const { userId, nextRole } = parsed.data;

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

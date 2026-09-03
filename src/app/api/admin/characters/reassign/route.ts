import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { logUsageEvent } from '@/data/telemetry/queries';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { adminReassignFormSchema } from '@/platform/auth/api-contract';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { accountBelongsToUser } from '@/platform/auth/linked-characters';
import { reassignCharacter } from '@/platform/auth/admin-users';
import { adminMutationGate } from '@/app/api/admin-mutation';
import { parseFormBody } from '@/transport/route-body';

// authz: admin
export const POST = capabilityRoute('admin.reassign-character', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const gate = await adminMutationGate(request);
  if (!gate.ok) return gate.response;
  const session = gate.session;
  const toUserId = session.user.id;

  const parsed = await parseFormBody(
    request,
    adminReassignFormSchema,
    (form) => ({ characterId: form.get('characterId'), fromUserId: form.get('fromUserId') }),
    () => validationFailure('invalid_form_field', 'Invalid form'),
  );
  if (!parsed.ok) return problemResponse(parsed.failure);
  const { characterId, fromUserId } = parsed.data;

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
  if (!sourceDeleted) {
    try {
      await reconcileAfterCharacterRemoval(fromUserId, characterId, identityProjectionRunners);
    } catch (err) {
      console.error(
        '[admin/characters/reassign] source identity rebind failed after the move committed',
        err,
      );
    }
  }

  void logUsageEvent({
    action: 'admin_character_reassign',
    characterId: session.characterId,
    metadata: {
      actorUserId: toUserId,
      targetUserId: fromUserId,
      characterId,
      sourceDeleted,
    },
  }).catch((err) => console.error('[admin/characters/reassign] telemetry write failed', err));

  return Response.redirect(new URL(`/admin/access/${toUserId}`, request.url), 303);
}

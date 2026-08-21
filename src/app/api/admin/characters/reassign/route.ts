import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import '@/composition/map-access-identity';
import { logUsageEvent } from '@/data/telemetry/queries';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';
import { adminReassignFormSchema } from '@/platform/auth/api-contract';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { accountBelongsToUser } from '@/platform/auth/linked-characters';
import { reassignCharacter } from '@/platform/auth/admin-users';
import { adminMutationGate } from '@/app/api/admin-mutation';
import { parseFormBody } from '@/transport/route-body';

/**
 * POST-only. Admin reassign — move a character from a standalone/other account
 * onto the acting admin's own account in one click (no OAuth re-login). Used to
 * consolidate the pre-linking standalone accounts. The destination is fixed to
 * the caller (session.user.id). If the source account is left empty it's removed
 * (see reassignCharacter); otherwise its identity email is rebound to a surviving
 * character. Never trust the posted owner — we verify the character actually
 * belongs to `fromUserId` first.
 */
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

  const { sourceDeleted } = await reassignCharacter({ characterId, fromUserId, toUserId });
  if (!sourceDeleted) {
    try {
      await reconcileAfterCharacterRemoval(fromUserId, characterId);
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

  // Land on the admin's own detail page so the moved character shows up under
  // their account (the source page may no longer exist).
  return Response.redirect(new URL(`/admin/access/${toUserId}`, request.url), 303);
}

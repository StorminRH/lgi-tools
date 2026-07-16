import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { adminReassignFormSchema } from '@/features/auth/api-contract';
import { accountBelongsToUser } from '@/features/auth/linked-characters';
import { reassignCharacter } from '@/features/auth/admin-users';
import { requireAdmin } from '@/features/auth/route-guards';
import { requireSameOrigin } from '@/features/auth/same-origin';
import { parseFormBody } from '@/lib/route-body';

// POST-only. Admin reassign — move a character from a standalone/other account
// onto the acting admin's own account in one click (no OAuth re-login). Used to
// consolidate the pre-linking standalone accounts. The destination is fixed to
// the caller (session.user.id). If the source account is left empty it's removed
// (see reassignCharacter). Never trust the posted owner — we verify the
// character actually belongs to `fromUserId` first.
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  requireSameOrigin(request);
  const session = gate.session;
  const toUserId = session.user.id;

  const parsed = await parseFormBody(
    request,
    adminReassignFormSchema,
    (form) => ({ characterId: form.get('characterId'), fromUserId: form.get('fromUserId') }),
    () => new Response('Invalid form', { status: 400 }),
  );
  if (!parsed.ok) return parsed.response;
  const { characterId, fromUserId } = parsed.data;

  if (fromUserId === toUserId) {
    return new Response('Character is already on your account', { status: 400 });
  }

  if (!(await accountBelongsToUser(fromUserId, characterId))) {
    return new Response('Character not linked to that user', { status: 404 });
  }

  const { sourceDeleted } = await reassignCharacter({ characterId, fromUserId, toUserId });

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

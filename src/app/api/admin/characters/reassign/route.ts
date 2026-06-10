import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { logUsageEvent } from '@/data/telemetry/queries';
import { auth } from '@/features/auth/auth';
import { accountBelongsToUser, reassignCharacter } from '@/features/auth/queries';

// Form payload from <AdminReassignCharacterForm>: the character to move and the
// account it currently sits on. The destination is always the acting admin.
const reassignFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
  fromUserId: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
});

// POST-only. Admin reassign — move a character from a standalone/other account
// onto the acting admin's own account in one click (no OAuth re-login). Used to
// consolidate the pre-linking standalone accounts. The destination is fixed to
// the caller (session.user.id). If the source account is left empty it's removed
// (see reassignCharacter). Never trust the posted owner — we verify the
// character actually belongs to `fromUserId` first.
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    return new Response('Forbidden', { status: 403 });
  }
  const toUserId = session.user.id;

  const form = await request.formData();
  const parsed = reassignFormSchema.safeParse({
    characterId: form.get('characterId'),
    fromUserId: form.get('fromUserId'),
  });
  if (!parsed.success) {
    return new Response('Invalid form', { status: 400 });
  }
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

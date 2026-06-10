import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { logUsageEvent } from '@/data/telemetry/queries';
import { auth } from '@/features/auth/auth';
import { EVE_PROVIDER_ID } from '@/features/auth/eve-sso';
import {
  getStoredActiveCharacterId,
  listLinkedCharacters,
  repointActiveToOldest,
} from '@/features/auth/queries';

// Form payload from <UnlinkCharacterForm>: the character to remove.
const unlinkFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
});

function redirectWithError(request: NextRequest, code: string): Response {
  const url = new URL('/characters', request.url);
  url.searchParams.set('error', code);
  return Response.redirect(url, 303);
}

// POST-only. Removes one of the signed-in pilot's linked EVE characters (and its
// stored encrypted tokens — deleteAccount drops the row). We pre-check ownership
// and the last-character guard ourselves for clean error copy; Better Auth's
// unlink also enforces both as a backstop. If the removed character was active,
// the active pointer is re-aimed at the oldest remaining one so the session never
// references a deleted account.
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const parsed = unlinkFormSchema.safeParse({ characterId: form.get('characterId') });
  if (!parsed.success) {
    return new Response('Invalid character', { status: 400 });
  }
  const { characterId } = parsed.data;

  const linked = await listLinkedCharacters(session.user.id);
  if (!linked.some((c) => c.characterId === characterId)) {
    return redirectWithError(request, 'not_linked');
  }
  // Can't remove the only character — there'd be no identity left to act as.
  if (linked.length <= 1) {
    return redirectWithError(request, 'last_character');
  }

  try {
    await auth.api.unlinkAccount({
      body: { providerId: EVE_PROVIDER_ID, accountId: String(characterId) },
      headers: h,
    });
  } catch (err) {
    console.error('[account/unlink] unlinkAccount failed', err);
    return redirectWithError(request, 'unlink_failed');
  }

  // Re-point the active character if we just removed it (the oldest remaining one
  // becomes active). Read the stored active id FRESH rather than trusting the
  // session snapshot, which a concurrent switch could have made stale. Safe
  // because the last-character guard above guarantees at least one account remains.
  const activeCharacterId = await getStoredActiveCharacterId(session.user.id);
  if (activeCharacterId === characterId) {
    await repointActiveToOldest(session.user.id);
  }

  void logUsageEvent({
    action: 'character_unlink',
    characterId: session.characterId,
    metadata: { userId: session.user.id, unlinkedCharacterId: characterId },
  }).catch((err) => console.error('[account/unlink] telemetry write failed', err));

  return Response.redirect(new URL('/characters', request.url), 303);
}

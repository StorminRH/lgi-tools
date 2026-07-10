import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { switchCharacterFormSchema } from '@/features/auth/api-contract';
import { auth } from '@/features/auth/auth';
import { accountBelongsToUser, setActiveCharacter } from '@/features/auth/queries';
import { rateLimitGuard } from '@/lib/rate-limit';

// POST-only. Sets the signed-in pilot's active character. Any authenticated user
// may switch among THEIR OWN linked characters — the ownership check is the real
// guard (a crafted POST can name any id; the UI-level row is just convenience).
// Mirrors /api/admin/role: Zod-validated form, fire-and-forget telemetry, 303.
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  // Per-IP rate limit, checked before the session read so a flood is rejected
  // at the cheapest point. Every accepted switch writes the DB; 30/min covers
  // any real pilot flipping characters and cuts a scripted loop off fast.
  const limit = await rateLimitGuard(request, { name: 'account-switch', perMinute: 30 });
  if (!limit.ok) return limit.response;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const parsed = switchCharacterFormSchema.safeParse({ characterId: form.get('characterId') });
  if (!parsed.success) {
    return new Response('Invalid character', { status: 400 });
  }
  const { characterId } = parsed.data;

  // The security-critical line: never trust the posted id. Only switch among the
  // user's own linked characters.
  if (!(await accountBelongsToUser(session.user.id, characterId))) {
    return new Response('Character not linked to your account', { status: 400 });
  }

  await setActiveCharacter(session.user.id, characterId);

  void logUsageEvent({
    action: 'character_switch',
    characterId: session.characterId,
    metadata: { userId: session.user.id, toCharacterId: characterId },
  }).catch((err) => console.error('[account/active-character] telemetry write failed', err));

  return Response.redirect(new URL('/characters', request.url), 303);
}

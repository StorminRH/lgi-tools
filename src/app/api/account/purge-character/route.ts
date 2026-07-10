import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { type PurgeCharacterResponse, purgeCharacterRequestSchema } from '@/features/auth/api-contract';
import { accountBelongsToUser, purgeOwnCharacter } from '@/features/auth/queries';
import { requireSession } from '@/features/auth/route-guards';
import { rateLimitGuard } from '@/lib/rate-limit';

// POST-only. Purge one of the CALLER's OWN linked characters — the destructive
// counterpart to unlink: it scrubs all of the character's derived data and revokes
// its EVE grant upstream (unlink only detaches). Returns { accountEmptied } so the
// UI knows whether purging the last character emptied (and deleted) the account.
// Acts on session.user.id only; the ownership check guards the posted character id.
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  // Per-IP rate limit, checked before the session read so a flood is rejected at
  // the cheapest point. A purge is a rare, deliberate action — 10/min is generous.
  const limit = await rateLimitGuard(request, {
    name: 'account-purge-character',
    perMinute: 10,
  });
  if (!limit.ok) return limit.response;

  const gate = await requireSession();
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const parsed = purgeCharacterRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response('Invalid character', { status: 400 });
  }
  const { characterId } = parsed.data;

  // The security-critical line: never trust the posted id. Only purge among the
  // user's own linked characters.
  if (!(await accountBelongsToUser(session.user.id, characterId))) {
    return new Response('Character not linked to your account', { status: 400 });
  }

  const result = await purgeOwnCharacter(session.user.id, characterId);

  // Identity-free purge counter (D-6) — deliberately carries NO character id.
  void logUsageEvent({
    action: 'account_purge',
    metadata: { scope: 'character' },
  }).catch((err) => console.error('[account/purge-character] telemetry write failed', err));

  return Response.json(result satisfies PurgeCharacterResponse);
}

// POST /api/internal/eve-token
// Internal service endpoint. A Convex action authenticates with the shared
// CONVEX_SERVICE_SECRET bearer and asks for a fresh short-lived EVE access token
// for one character. The response carries ONLY the access token — the refresh
// token is never read into this file, so it cannot leak to the caller. Per-user
// ownership of the character is enforced by Convex (which holds the user JWT)
// before it calls here; this endpoint trusts the bearer-authenticated service.
// authz: service
import { createHash, timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { z } from 'zod';
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';

const bodySchema = z.object({
  characterId: z.number().int().positive(),
});

// Constant-time bearer check. Comparing SHA-256 digests (always 32 bytes) keeps
// timingSafeEqual's equal-length requirement satisfied and leaks no length, so a
// timing side-channel can't reveal CONVEX_SERVICE_SECRET character by character.
function bearerMatches(authorization: string | null, secret: string): boolean {
  const provided = createHash('sha256').update(authorization ?? '').digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

export async function POST(req: Request): Promise<Response> {
  // Reads a secret + the DB per request — defer past prerender (Cache Components).
  await connection();

  const secret = process.env.CONVEX_SERVICE_SECRET;
  if (!secret) {
    return new Response('CONVEX_SERVICE_SECRET not configured', { status: 500 });
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  const result = await getFreshAccessTokenForCharacter(parsed.data.characterId);
  switch (result.kind) {
    case 'ok':
      return Response.json({
        accessToken: result.accessToken,
        expiresAt: result.expiresAt.toISOString(),
        characterId: result.characterId,
        scopes: result.scopes,
      });
    case 'not_found':
      return Response.json({ error: 'not_found' }, { status: 404 });
    case 'reauth_required':
      return Response.json({ error: 'reauth_required' }, { status: 409 });
    case 'upstream_error':
      return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}

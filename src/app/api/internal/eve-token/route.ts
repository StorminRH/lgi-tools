// POST /api/internal/eve-token
// Internal service endpoint. A Convex action authenticates with the shared
// CONVEX_SERVICE_SECRET bearer and asks for a fresh short-lived EVE access token
// for one character. The response carries ONLY the access token — the refresh
// token is never read into this file, so it cannot leak to the caller. Per-user
// ownership of the character is enforced upstream by construction: the Convex
// action only requests tokens for characters /api/internal/eve-characters
// returned for the userId it authenticated. This endpoint trusts the
// bearer-authenticated service.
// authz: service
// rate-limit: exempt — bearer-secret service auth, not an IP-keyed public surface.
import { connection } from 'next/server';
import {
  eveTokenRequestSchema,
  type EveTokenErrorResponse,
  type EveTokenOkResponse,
} from '@/features/auth/api-contract';
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';
import { readEnv } from '@/lib/env';
import { bearerMatches } from '@/lib/service-auth';

export async function POST(req: Request): Promise<Response> {
  // Reads a secret + the DB per request — defer past prerender (Cache Components).
  await connection();

  const secret = readEnv('CONVEX_SERVICE_SECRET');
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

  const parsed = eveTokenRequestSchema.safeParse(body);
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
      } satisfies EveTokenOkResponse);
    case 'not_found':
      return Response.json({ error: 'not_found' } satisfies EveTokenErrorResponse, { status: 404 });
    case 'reauth_required':
      return Response.json({ error: 'reauth_required' } satisfies EveTokenErrorResponse, { status: 409 });
    case 'upstream_error':
      return Response.json({ error: 'upstream_error' } satisfies EveTokenErrorResponse, { status: 502 });
  }
}

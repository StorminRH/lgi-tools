// POST /api/internal/eve-token
// Internal service endpoint. A Convex action authenticates with the shared
// CONVEX_SERVICE_SECRET bearer and asks for a fresh short-lived EVE access token
// for one character. The response carries ONLY the access token — the refresh
// token is never read into this file, so it cannot leak to the caller. Per-user
// ownership of the character is rechecked here after service authentication so
// a caller cannot turn a character id from another enumeration into a token.
// authz: service
// rate-limit: exempt — bearer-secret service auth, not an IP-keyed public surface.
import {
  eveTokenRequestSchema,
  type EveTokenErrorResponse,
  type EveTokenOkResponse,
} from '@/platform/auth/api-contract';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { accountBelongsToUser } from '@/platform/auth/linked-characters';
import { parseJsonBody } from '@/lib/route-body';
import { requireServiceAuth } from '@/lib/service-auth';

/**
 * Handles POST requests for /api/internal/eve-token; this route owns its authorization, boundary
 * validation, and typed response mapping.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = await requireServiceAuth(req);
  if (denied) return denied;

  const parsed = await parseJsonBody(req, eveTokenRequestSchema);
  if (!parsed.ok) return parsed.response;

  if (!(await accountBelongsToUser(parsed.data.userId, parsed.data.characterId))) {
    return Response.json(
      { error: 'not_found' } satisfies EveTokenErrorResponse,
      { status: 404 },
    );
  }

  const result = await getFreshAccessTokenForCharacter(parsed.data.characterId);
  switch (result.kind) {
    case 'ok':
      return Response.json({
        accessToken: result.accessToken,
      } satisfies EveTokenOkResponse);
    case 'not_found':
      return Response.json({ error: 'not_found' } satisfies EveTokenErrorResponse, { status: 404 });
    case 'reauth_required':
      return Response.json({ error: 'reauth_required' } satisfies EveTokenErrorResponse, { status: 409 });
    case 'upstream_error':
      return Response.json({ error: 'upstream_error' } satisfies EveTokenErrorResponse, { status: 502 });
  }
}

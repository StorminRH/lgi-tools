// POST /api/dev/esi
// The /dev/esi sandbox's read endpoint (3.4.6): vends one authenticated ESI
// read for one of the caller's own linked characters, through the shared gate,
// and reports the raw outcome — status, body text, and the cache/rate headers
// — as data. ESI-level failures (304, 403, budget refusals, 5xx) are 200s with
// a kind, because observing them is this endpoint's whole purpose; only the
// route's own auth/validation failures are HTTP errors. Mirrors the /dev/esi
// page gate: any session may read on preview/dev, production requires admin.
// authz: admin
import { headers } from 'next/headers';
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';
import { auth } from '@/features/auth/auth';
import { accountBelongsToUser } from '@/features/auth/queries';
import { readEnv } from '@/lib/env';
import { EsiBudgetExhaustedError, EsiServerError, esiFetch, esiUrl } from '@/lib/esi';
import {
  DEV_ESI_ENDPOINTS,
  devEsiReadRequestSchema,
  type DevEsiReadResponse,
} from '@/app/dev/esi/api-contract';

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (readEnv('VERCEL_ENV') === 'production' && !session.isAdmin) {
    return new Response('Forbidden', { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = devEsiReadRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }
  const { characterId, endpoint, planetId, ifNoneMatch } = parsed.data;

  if (!(await accountBelongsToUser(session.user.id, characterId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const token = await getFreshAccessTokenForCharacter(characterId);
  if (token.kind !== 'ok') {
    return Response.json({
      kind: 'token_error',
      error: token.kind,
    } satisfies DevEsiReadResponse);
  }

  const path = DEV_ESI_ENDPOINTS[endpoint].pathTemplate
    .replace('{characterId}', String(characterId))
    .replace('{planetId}', String(planetId));

  const outboundHeaders: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
  };

  let res: Response;
  const startedAt = performance.now();
  try {
    // interactive: the sandbox is a human at a button — it gets the gate's
    // hard-capped trickle when the scoreboard is down instead of a refusal.
    res = await esiFetch(esiUrl(path), { headers: outboundHeaders }, { interactive: true });
  } catch (err) {
    if (err instanceof EsiBudgetExhaustedError) {
      return Response.json({
        kind: 'budget_exhausted',
        reason: err.reason,
        remaining: err.remaining,
      } satisfies DevEsiReadResponse);
    }
    if (err instanceof EsiServerError) {
      return Response.json({
        kind: 'server_error',
        status: err.status,
      } satisfies DevEsiReadResponse);
    }
    throw err;
  }
  const elapsedMs = Math.round(performance.now() - startedAt);

  return Response.json({
    kind: 'esi',
    status: res.status,
    // Raw text, not parsed JSON — a 304 has no body and an error body's exact
    // shape is part of what the sandbox documents.
    bodyText: await res.text(),
    elapsedMs,
    headers: {
      etag: res.headers.get('ETag'),
      expires: res.headers.get('Expires'),
      cacheControl: res.headers.get('Cache-Control'),
      contentType: res.headers.get('Content-Type'),
      rateLimitGroup: res.headers.get('X-Ratelimit-Group'),
      rateLimitLimit: res.headers.get('X-Ratelimit-Limit'),
      rateLimitRemaining: res.headers.get('X-Ratelimit-Remaining'),
      rateLimitUsed: res.headers.get('X-Ratelimit-Used'),
      errorLimitRemain: res.headers.get('X-ESI-Error-Limit-Remain'),
      errorLimitReset: res.headers.get('X-ESI-Error-Limit-Reset'),
      retryAfter: res.headers.get('Retry-After'),
    },
  } satisfies DevEsiReadResponse);
}

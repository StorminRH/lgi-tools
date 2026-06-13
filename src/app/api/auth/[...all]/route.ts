import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/features/auth/auth';
import { clientIdentifier, rateLimit, type RateLimitedBody } from '@/lib/rate-limit';

// Better Auth's catch-all: login (EVE OAuth start + callback), sign-out, and
// get-session all mount under /api/auth/*. These are public auth endpoints —
// they establish identity rather than requiring it.
// authz: public
const { GET, POST: betterAuthPost } = toNextJsHandler(auth);

export { GET };

// The two anonymous OAuth entry paths: starting a sign-in and starting an
// alt-character link (authClient.oauth2.link). Better Auth's built-in
// production rate limiter remains as a weak second layer — it counts in
// memory per serverless instance, so it can't see traffic across instances;
// the Upstash check here is the effective distributed per-IP limit.
const OAUTH_ENTRY_LIMITS = new Map<string, { name: string; perMinute: number }>([
  ['/api/auth/sign-in/oauth2', { name: 'auth-oauth-signin', perMinute: 10 }],
  ['/api/auth/oauth2/link', { name: 'auth-oauth-link', perMinute: 10 }],
]);

export async function POST(request: Request): Promise<Response> {
  const policy = OAUTH_ENTRY_LIMITS.get(new URL(request.url).pathname);
  if (policy) {
    const limit = await rateLimit(clientIdentifier(request.headers), policy);
    if (!limit.ok) {
      return Response.json(
        { error: 'rate_limited', retryAfter: limit.retryAfter } satisfies RateLimitedBody,
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfter) },
        },
      );
    }
  }
  return betterAuthPost(request);
}

import { toNextJsHandler } from 'better-auth/next-js';
import { runWithAbsorbTracking } from '@/features/auth/absorb-context';
import { decorateAbsorbRedirect } from '@/features/auth/absorb-redirect';
import { auth } from '@/features/auth/auth';
import { rateLimitGuard } from '@/lib/rate-limit';

// Better Auth's catch-all: login (EVE OAuth start + callback), sign-out, and
// get-session all mount under /api/auth/*. These are public auth endpoints —
// they establish identity rather than requiring it.
// authz: public
const { GET: betterAuthGet, POST: betterAuthPost } = toNextJsHandler(auth);

// GET runs inside the absorb-tracking scope so the OAuth callback can report
// an absorb-on-proof (a stray duplicate account merged during "Add character")
// and the SUCCESS redirect can carry it to the roster's moved-note (the
// decoration rules live with decorateAbsorbRedirect).
export async function GET(request: Request): Promise<Response> {
  const { result: response, absorbedCharacterId } = await runWithAbsorbTracking(() =>
    betterAuthGet(request),
  );
  return decorateAbsorbRedirect(response, request.url, absorbedCharacterId);
}

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
    const limit = await rateLimitGuard(request, policy);
    if (!limit.ok) return limit.response;
  }
  return betterAuthPost(request);
}

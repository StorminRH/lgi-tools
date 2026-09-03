import { toNextJsHandler } from 'better-auth/next-js';
import '@/composition/account-lifecycle/register-owner-reconciler';
import { auth } from '@/composition/auth';
import { runWithAbsorbTracking } from '@/platform/auth/absorb-context';
import { decorateAbsorbRedirect } from '@/platform/auth/absorb-redirect';
import { checkRateLimit } from '@/lib/rate-limit';
import { problemResponse } from '@/transport/api-response';

// authz: public
const { GET: betterAuthGet, POST: betterAuthPost } = toNextJsHandler(auth);

export async function GET(request: Request): Promise<Response> {
  const { result: response, absorbedCharacterId } = await runWithAbsorbTracking(() =>
    betterAuthGet(request),
  );
  return decorateAbsorbRedirect(response, request.url, absorbedCharacterId);
}

const OAUTH_ENTRY_LIMITS = new Map<string, { name: string; perMinute: number }>([
  ['/api/auth/sign-in/oauth2', { name: 'auth-oauth-signin', perMinute: 10 }],
  ['/api/auth/oauth2/link', { name: 'auth-oauth-link', perMinute: 10 }],
]);

export async function POST(request: Request): Promise<Response> {
  const policy = OAUTH_ENTRY_LIMITS.get(new URL(request.url).pathname);
  if (policy) {
    const limit = await checkRateLimit(request, policy);
    if (!limit.ok) return problemResponse(limit.failure);
  }
  return betterAuthPost(request);
}

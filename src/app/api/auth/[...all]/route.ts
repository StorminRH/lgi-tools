import { after } from 'next/server';
import { checkUserCharacterAuthorizations } from '@/composition/character-authorization';
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/composition/auth';
import { runWithMergeTracking } from '@/platform/auth/merge-context';
import { expireSessionCacheCookies } from '@/platform/auth/session-cache-cookies';
import { checkRateLimit } from '@/lib/rate-limit';
import { problemResponse } from '@/transport/api-response';

// authz: public
const { GET: betterAuthGet, POST: betterAuthPost } = toNextJsHandler(auth);

/** The signed-in user's id from a get-session body, which is `null` when signed out. */
function sessionUserId(body: unknown): string | null {
  const user: unknown = typeof body === 'object' && body !== null && 'user' in body ? body.user : null;
  const id: unknown = typeof user === 'object' && user !== null && 'id' in user ? user.id : null;
  return typeof id === 'string' && id !== '' ? id : null;
}

export async function GET(request: Request): Promise<Response> {
  const { result: response, merged } = await runWithMergeTracking(() => betterAuthGet(request));
  if (new URL(request.url).pathname === '/api/auth/get-session' && response.ok) {
    // Clone before the body streams to the client or is rewrapped below; after() runs once it is sent.
    const session = response.clone();
    after(async () => {
      const userId = sessionUserId(await session.json().catch(() => null));
      if (userId) await checkUserCharacterAuthorizations(userId);
    });
  }
  if (!merged) return response;
  const headers = new Headers(response.headers);
  for (const expired of expireSessionCacheCookies(await auth.$context, request.headers.get('cookie'))) {
    headers.append('set-cookie', expired);
  }
  return new Response(response.body, { status: response.status, headers });
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

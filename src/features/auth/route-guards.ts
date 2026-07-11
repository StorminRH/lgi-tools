// Auth-aware route/page guards — the session half of the route-handler kit.
//
// Route-kit dividing rule: these guards need the Better Auth instance, so they
// live in the auth slice (lib may import only lib); the auth-AGNOSTIC route
// plumbing (parseJsonBody, rateLimitGuard, requireBearerSecret) lives in
// src/lib beside route-body.ts. Same return-based ok/response union as
// parseJsonBody — a handler's happy path stays
// `if (!gate.ok) return gate.response;`, and guard ORDER (e.g. rate-limit
// before session) remains the route's own composition.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { getCurrentUserId } from './session';

type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type SessionGuardResult =
  | { ok: true; session: BetterAuthSession }
  | { ok: false; response: Response };

// The signed-in gate for mutating routes: 401 for anonymous callers. Read-only
// surfaces that fail soft (empty payload for anonymous) keep their own
// per-route early return instead — never force a 401 onto those.
export async function requireSession(): Promise<SessionGuardResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  }
  return { ok: true, session };
}

// The admin gate for `authz: admin` routes. Independent gate — never trust a
// UI-level disable; the handler is the source of truth for who can mutate.
export async function requireAdmin(): Promise<SessionGuardResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    return { ok: false, response: new Response('Forbidden', { status: 403 }) };
  }
  return { ok: true, session };
}

export type UserIdGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

// The per-USER gate (Better Auth user id, distinct from the active character)
// for routes that write user-keyed rows: 401 for anonymous callers.
export async function requireUserId(): Promise<UserIdGuardResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  }
  return { ok: true, userId };
}

// The admin gate for server PAGES: redirects instead of a 403 (page context),
// and hands back the session for the viewer id the dashboards need.
export async function requireAdminPage(): Promise<BetterAuthSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    redirect('/?auth_error=admin_required');
  }
  return session;
}

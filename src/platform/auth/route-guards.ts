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
import {
  forbiddenFailure,
  type AppFailure,
  unauthenticatedFailure,
} from '@/lib/failure';
import { problemResponse } from '@/lib/problem';
import { auth } from './auth';
import { getCurrentUserId } from './session';

type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** Typed session-check result returned before HTTP problem serialization. */
export type SessionCheckResult =
  | { ok: true; session: BetterAuthSession }
  | { ok: false; failure: AppFailure };

/**
 * Route-guard verdict that either carries the authenticated Better Auth session or the response
 * the route must return unchanged.
 */
export type SessionGuardResult =
  | { ok: true; session: BetterAuthSession }
  | { ok: false; response: Response };

/** Checks for a signed-in session without constructing an HTTP response. */
export async function checkSession(): Promise<SessionCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, session };
}

/**
 * The signed-in gate for mutating routes: 401 for anonymous callers. Read-only
 * surfaces that fail soft (empty payload for anonymous) keep their own
 * per-route early return instead — never force a 401 onto those.
 */
export async function requireSession(): Promise<SessionGuardResult> {
  const result = await checkSession();
  if (!result.ok) {
    return { ok: false, response: problemResponse(result.failure) };
  }
  return result;
}

/** Checks for admin authority without constructing an HTTP response. */
export async function checkAdmin(): Promise<SessionCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    return { ok: false, failure: forbiddenFailure() };
  }
  return { ok: true, session };
}

/**
 * The admin gate for `authz: admin` routes. Independent gate — never trust a
 * UI-level disable; the handler is the source of truth for who can mutate.
 */
export async function requireAdmin(): Promise<SessionGuardResult> {
  const result = await checkAdmin();
  if (!result.ok) {
    return { ok: false, response: problemResponse(result.failure) };
  }
  return result;
}

/** Typed user-id check result returned before HTTP problem serialization. */
export type UserIdCheckResult =
  | { ok: true; userId: string }
  | { ok: false; failure: AppFailure };

/**
 * Route-guard verdict that either carries the authenticated user id or the response the route must
 * return unchanged.
 */
export type UserIdGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

/** Checks for a signed-in Better Auth user id without constructing an HTTP response. */
export async function checkUserId(): Promise<UserIdCheckResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, userId };
}

/**
 * The per-USER gate (Better Auth user id, distinct from the active character)
 * for routes that write user-keyed rows: 401 for anonymous callers.
 */
export async function requireUserId(): Promise<UserIdGuardResult> {
  const result = await checkUserId();
  if (!result.ok) {
    return { ok: false, response: problemResponse(result.failure) };
  }
  return result;
}

/**
 * The admin gate for server PAGES: redirects instead of a 403 (page context),
 * and hands back the session for the viewer id the dashboards need.
 */
export async function requireAdminPage(): Promise<BetterAuthSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    redirect('/?auth_error=admin_required');
  }
  return session;
}

// Auth-aware route/page guards — the session half of the route-handler kit.
//
// Route-kit dividing rule: these guards need the Better Auth instance, so they
// live in the auth slice (lib may import only lib); the auth-AGNOSTIC route
// plumbing (readJsonBody, checkRateLimit, requireBearerSecret) lives in
// src/lib beside route-body.ts. The route owns guard ordering and maps each
// returned application failure at its delivery boundary.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  forbiddenFailure,
  type AppFailure,
  unauthenticatedFailure,
} from '@/lib/failure';
import { auth } from '@/composition/auth';
import { getCurrentUserId } from '@/composition/session';
import { requireSameOrigin } from '@/platform/auth/same-origin';

export type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** Typed session-check result returned before HTTP problem serialization. */
export type SessionCheckResult =
  | { ok: true; session: BetterAuthSession }
  | { ok: false; failure: AppFailure };

/** Checks for a signed-in session without constructing an HTTP response. */
export async function checkSession(): Promise<SessionCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, session };
}

/** Checks for admin authority without constructing an HTTP response. */
export async function checkAdmin(): Promise<SessionCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    return { ok: false, failure: forbiddenFailure() };
  }
  return { ok: true, session };
}

/** Applies the shared admin-session and same-origin gates for form mutations. */
export async function checkAdminMutation(
  request: Request,
): Promise<SessionCheckResult> {
  const gate = await checkAdmin();
  if (!gate.ok) return gate;
  const origin = requireSameOrigin(request);
  if (!origin.ok) return origin;
  return gate;
}

/** Typed user-id check result returned before HTTP problem serialization. */
export type UserIdCheckResult =
  | { ok: true; userId: string }
  | { ok: false; failure: AppFailure };

/** Checks for a signed-in Better Auth user id without constructing an HTTP response. */
export async function checkUserId(): Promise<UserIdCheckResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, userId };
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

import { redirect } from 'next/navigation';
import {
  forbiddenFailure,
  type FailureResult,
  unauthenticatedFailure,
} from '@/lib/failure';
import type { auth } from '@/composition/auth';
import { authErrorHref } from '@/composition/auth-error';
import { getCurrentUserId, getFullSession } from '@/composition/session';

export type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type SessionCheckResult =
  | { ok: true; session: BetterAuthSession }
  | FailureResult;

// Every guard reads through getFullSession, so each signed-in request schedules the authorization check.
export async function checkSession(): Promise<SessionCheckResult> {
  const session = await getFullSession();
  if (!session) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, session };
}

export async function checkAdmin(): Promise<SessionCheckResult> {
  const session = await getFullSession();
  if (!session?.isAdmin) {
    return { ok: false, failure: forbiddenFailure() };
  }
  return { ok: true, session };
}

export type UserIdCheckResult =
  | { ok: true; userId: string }
  | FailureResult;

export async function checkUserId(): Promise<UserIdCheckResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, userId };
}

/** Page guard for signed-in screens: sends a signed-out visitor home with the login notice. */
export async function requireSessionPage(): Promise<BetterAuthSession> {
  const session = await getFullSession();
  if (!session) {
    redirect(authErrorHref('login_required'));
  }
  return session;
}

export async function requireAdminPage(): Promise<BetterAuthSession> {
  const session = await getFullSession();
  if (!session?.isAdmin) {
    redirect(authErrorHref('admin_required'));
  }
  return session;
}

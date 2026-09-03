import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  forbiddenFailure,
  type AppFailure,
  unauthenticatedFailure,
} from '@/lib/failure';
import { auth } from './auth';
import { getCurrentUserId } from './session';
import { requireSameOrigin } from './same-origin';

export type BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type SessionCheckResult =
  | { ok: true; session: BetterAuthSession }
  | { ok: false; failure: AppFailure };

export async function checkSession(): Promise<SessionCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, session };
}

export async function checkAdmin(): Promise<SessionCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    return { ok: false, failure: forbiddenFailure() };
  }
  return { ok: true, session };
}

export async function checkAdminMutation(
  request: Request,
): Promise<SessionCheckResult> {
  const gate = await checkAdmin();
  if (!gate.ok) return gate;
  const origin = requireSameOrigin(request);
  if (!origin.ok) return origin;
  return gate;
}

export type UserIdCheckResult =
  | { ok: true; userId: string }
  | { ok: false; failure: AppFailure };

export async function checkUserId(): Promise<UserIdCheckResult> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true, userId };
}

export async function requireAdminPage(): Promise<BetterAuthSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    redirect('/?auth_error=admin_required');
  }
  return session;
}

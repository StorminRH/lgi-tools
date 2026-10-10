const AUTHORIZATION_MAX_FAILURE_AGE_MS = 24 * 60 * 60 * 1000;
const AUTHORIZATION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Authorization failures that began at or before this instant have outlasted
 * the grace window: the account is overdue for suspension, its "authorization
 * delayed" badge shows, and it no longer counts toward shared access.
 */
export function authorizationFailureCutoff(now: number = Date.now()): Date {
  return new Date(now - AUTHORIZATION_MAX_FAILURE_AGE_MS);
}

/** True once the first unresolved failure reaches the cutoff; the boundary itself is delayed. */
export function isAuthorizationDelayed(firstAt: Date | null, now: number = Date.now()): boolean {
  return firstAt !== null && firstAt.getTime() <= authorizationFailureCutoff(now).getTime();
}

/** Three early retries, then hourly. Times are measured from the last attempt. */
export function authorizationRetryAt(failureCount: number, now: number, retryAfterMs = 0): Date {
  const delay = [5, 10, 15][Math.min(failureCount, 3)] ?? 60;
  return new Date(now + Math.max(delay * 60_000, retryAfterMs));
}

export function successfulAuthorization(now = new Date()) {
  return {
    authorizationVerifiedAt: now,
    authorizationSuspended: false,
    authorizationNextCheckAt: new Date(now.getTime() + AUTHORIZATION_CHECK_INTERVAL_MS),
    authorizationFailureFirstAt: null,
    authorizationFailureCount: 0,
  };
}

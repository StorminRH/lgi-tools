export const AUTHORIZATION_MAX_FAILURE_AGE_MS = 24 * 60 * 60 * 1000;
const AUTHORIZATION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

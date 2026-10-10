import { expect, test } from 'vitest';
import { authorizationFailureCutoff, isAuthorizationDelayed } from './authorization-policy';

const DAY_MS = 24 * 60 * 60 * 1000;

test('an authorization failure is delayed from exactly one day after it began', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');

  expect(authorizationFailureCutoff(now)).toEqual(new Date('2026-07-14T12:00:00Z'));
  expect(isAuthorizationDelayed(new Date(now - DAY_MS - 1), now)).toBe(true);
  expect(isAuthorizationDelayed(new Date(now - DAY_MS), now)).toBe(true);
  expect(isAuthorizationDelayed(new Date(now - DAY_MS + 1), now)).toBe(false);
  expect(isAuthorizationDelayed(null, now)).toBe(false);

  // Without an explicit instant both read the current clock.
  const before = Date.now();
  const cutoff = authorizationFailureCutoff().getTime();
  expect(cutoff).toBeGreaterThanOrEqual(before - DAY_MS);
  expect(cutoff).toBeLessThanOrEqual(Date.now() - DAY_MS);
  expect(isAuthorizationDelayed(new Date(before - DAY_MS))).toBe(true);
  expect(isAuthorizationDelayed(new Date(Date.now() - DAY_MS + 60_000))).toBe(false);
});

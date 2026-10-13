import { afterEach, expect, it, vi } from 'vitest';
import { isConvexConfigured } from '@/config/public-env';
import { resolveConvexServiceDoor } from './convex-service-door';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['http://evil.example:3210', false],
  ['http://example.convex.cloud', false],
  ['ftp://localhost:3210', false],
  ['http://localhost.evil.example:3210', false],
  ['not a url', false],
  ['http://localhost:3210', true],
  ['http://127.0.0.1:3210', true],
  ['http://[::1]:3210', true],
  ['https://example.convex.cloud', true],
] as const)('requires HTTPS or local HTTP for %s', (url, allowed) => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', url);
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'test-service-secret');
  const door = resolveConvexServiceDoor();
  expect(door.ok).toBe(allowed);
  if (!allowed) expect(door).not.toHaveProperty('secret');
});

// A configured URL without a secret is a misconfiguration that callers must
// not skip, so only the convex_not_configured reason matches the predicate.
it.each([
  ['unset', undefined, false, 'convex_not_configured'],
  ['empty', '', false, 'convex_not_configured'],
  ['set', 'https://example.convex.cloud', true, 'service_secret_missing'],
] as const)('agrees with isConvexConfigured when the URL is %s', (_case, url, configured, reason) => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', url);
  vi.stubEnv('CONVEX_SERVICE_SECRET', '');
  expect(isConvexConfigured()).toBe(configured);
  expect(resolveConvexServiceDoor()).toEqual({ ok: false, reason });
});

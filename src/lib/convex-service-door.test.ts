import { afterEach, expect, it, vi } from 'vitest';
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

it('distinguishes absent URL and absent secret without exposing credentials', () => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
  expect(resolveConvexServiceDoor()).toEqual({ ok: false, reason: 'convex_not_configured' });
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
  vi.stubEnv('CONVEX_SERVICE_SECRET', '');
  expect(resolveConvexServiceDoor()).toEqual({ ok: false, reason: 'service_secret_missing' });
});

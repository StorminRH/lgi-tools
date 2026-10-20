import { afterEach, expect, test, vi } from 'vitest';
import {
  conflictFailure,
  dependencyUnavailableFailure,
  notFoundFailure,
  unauthenticatedFailure,
} from '@/lib/failure';
import { problemBody, serializeProblem } from '@/lib/problem';
import {
  type TokenVend,
  requireSyncEnv,
  resolveExpiresAt,
  vendCharacterToken,
} from './characterSync';

const NOW = 1_700_000_000_000;
const FALLBACK = 60_000;

const ENV = { siteUrl: 'https://app.test', secret: 'service-secret' };

const stubFetch = (response: Response | Error) => {
  const mock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', mock);
  return mock;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('requireSyncEnv reads SITE_URL as an origin and refuses an unusable origin or an empty secret', () => {
  vi.stubEnv('SITE_URL', 'https://app.test/');
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'service-secret');
  expect(requireSyncEnv()).toEqual({ siteUrl: 'https://app.test', secret: 'service-secret' });

  vi.stubEnv('SITE_URL', '');
  expect(() => requireSyncEnv()).toThrowError(/SITE_URL/);

  vi.stubEnv('SITE_URL', 'https://app.test');
  vi.stubEnv('CONVEX_SERVICE_SECRET', '');
  expect(() => requireSyncEnv()).toThrowError(/CONVEX_SERVICE_SECRET/);
});

test('vendCharacterToken sends both the owning user and character identifiers with service auth', async () => {
  const fetchMock = stubFetch(Response.json({ accessToken: 'fresh-token', expiresAt: 1_700_000_000_000 }));

  const result = await vendCharacterToken(ENV, 'user-1', 90000001);

  expect(result).toEqual({
    kind: 'token',
    accessToken: 'fresh-token',
    expiresAt: 1_700_000_000_000,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://app.test/api/internal/eve-token',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ userId: 'user-1', characterId: 90000001 }),
      headers: expect.objectContaining({ Authorization: 'Bearer service-secret' }),
    }),
  );
});

test.each<[string, () => Response, TokenVend]>([
  ['404', () => serializeProblem(problemBody(notFoundFailure(), 'correlation-id')), { kind: 'skip' }],
  ['409', () => serializeProblem(problemBody(conflictFailure('reauth_required'), 'correlation-id')), { kind: 'reauth' }],
  ['401', () => serializeProblem(problemBody(unauthenticatedFailure(), 'correlation-id')), { kind: 'unavailable' }],
  ['502', () => serializeProblem(problemBody(dependencyUnavailableFailure('upstream_error', 502), 'correlation-id')), { kind: 'unavailable' }],
  ['a drifted success body', () => Response.json({ token: 'wrong-field' }), { kind: 'unavailable' }],
])('vendCharacterToken maps %s without vending a token', async (_case, response, expected) => {
  stubFetch(response());

  await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual(expected);
});

test('vendCharacterToken rethrows a transport rejection so the Action Retrier retries', async () => {
  stubFetch(new TypeError('Failed to fetch'));

  await expect(vendCharacterToken(ENV, 'user-1', 90000001)).rejects.toThrowError(
    'Failed to fetch',
  );
});

test('resolveExpiresAt takes the earliest present window, else now + ttl', () => {
  expect(resolveExpiresAt([NOW + 5000, NOW + 1000], FALLBACK, NOW)).toBe(NOW + 1000);
  expect(resolveExpiresAt([null, NOW + 2000], FALLBACK, NOW)).toBe(NOW + 2000);
  expect(resolveExpiresAt([null, null], FALLBACK, NOW)).toBe(NOW + FALLBACK);
});

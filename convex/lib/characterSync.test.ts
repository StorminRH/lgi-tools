import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AppFailure,
  conflictFailure,
  dependencyUnavailableFailure,
  notFoundFailure,
  unauthenticatedFailure,
  unexpectedFailure,
} from '@/lib/failure';
import { problemBody, serializeProblem } from '@/lib/problem';
import {
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

describe('requireSyncEnv', () => {
  it('reads SITE_URL as an origin so a trailing slash still vends at a single-slash path', async () => {
    vi.stubEnv('SITE_URL', 'https://app.test/');
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'service-secret');
    const fetchMock = stubFetch(Response.json({ accessToken: 'fresh-token', expiresAt: NOW }));

    const env = requireSyncEnv();

    expect(env).toEqual({ siteUrl: 'https://app.test', secret: 'service-secret' });
    await expect(vendCharacterToken(env, 'user-1', 90000001)).resolves.toMatchObject({
      kind: 'token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.test/api/internal/eve-token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['an empty SITE_URL', '', 'service-secret'],
    ['a plain-HTTP SITE_URL off loopback', 'http://app.test', 'service-secret'],
    ['an empty service secret', 'https://app.test', ''],
  ])('refuses %s instead of vending to it', (_case, siteUrl, secret) => {
    vi.stubEnv('SITE_URL', siteUrl);
    vi.stubEnv('CONVEX_SERVICE_SECRET', secret);

    expect(() => requireSyncEnv()).toThrowError(
      'SITE_URL and CONVEX_SERVICE_SECRET must be set on this Convex deployment',
    );
  });
});

describe('vendCharacterToken', () => {
  it('sends both the owning user and character identifiers with service auth', async () => {
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

  it('maps 404 to a silent skip', async () => {
    stubFetch(serializeProblem(problemBody(notFoundFailure(), 'correlation-id')));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual({
      kind: 'skip',
    });
  });

  it('maps 409 to a reauth requirement', async () => {
    stubFetch(serializeProblem(problemBody(conflictFailure('reauth_required'), 'correlation-id')));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual({
      kind: 'reauth',
    });
  });

  it.each<[number, AppFailure]>([
    [401, unauthenticatedFailure()],
    [500, unexpectedFailure('not_configured')],
    [502, dependencyUnavailableFailure('upstream_error', 502)],
  ])('maps other non-success status %i to unavailable', async (_status, failure) => {
    stubFetch(serializeProblem(problemBody(failure, 'correlation-id')));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('maps an undeclared status to unavailable', async () => {
    stubFetch(new Response('gateway timeout', { status: 504 }));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('maps a drifted success body to unavailable instead of vending garbage', async () => {
    stubFetch(Response.json({ token: 'wrong-field' }));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('rethrows a transport rejection so the Action Retrier retries', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).rejects.toThrowError(
      'Failed to fetch',
    );
  });
});

describe('resolveExpiresAt', () => {
  it('returns the earliest present window', () => {
    expect(resolveExpiresAt([NOW + 5000, NOW + 1000], FALLBACK, NOW)).toBe(NOW + 1000);
  });

  it('ignores null windows when at least one is present', () => {
    expect(resolveExpiresAt([null, NOW + 2000], FALLBACK, NOW)).toBe(NOW + 2000);
  });

  it('falls back to now + ttl when every window is null', () => {
    expect(resolveExpiresAt([null, null], FALLBACK, NOW)).toBe(NOW + FALLBACK);
  });

  it('falls back to now + ttl when there are no windows', () => {
    expect(resolveExpiresAt([], FALLBACK, NOW)).toBe(NOW + FALLBACK);
  });

  it('passes a single present window through', () => {
    expect(resolveExpiresAt([NOW + 300_000], FALLBACK, NOW)).toBe(NOW + 300_000);
  });
});

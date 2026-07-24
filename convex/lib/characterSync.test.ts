import { afterEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';
import {
  fetchEnumeratedCharacters,
  resolveExpiresAt,
  vendCharacterToken,
} from './characterSync';

const NOW = 1_700_000_000_000;
const FALLBACK = 60_000;

const ENV = { siteUrl: 'https://app.test', secret: 'service-secret' };

const problemResponse = (code: string, status: number) =>
  Response.json(
    problemBodySchema.parse({
      type: `https://lgi.tools/problems/${code}`,
      title: 'Request failed',
      status,
      code,
      correlationId: 'correlation-id',
    }),
    { status },
  );

const stubFetch = (response: Response | Error) => {
  const mock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', mock);
  return mock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vendCharacterToken', () => {
  it('sends both the owning user and character identifiers with service auth', async () => {
    const fetchMock = stubFetch(Response.json({ accessToken: 'fresh-token' }));

    const result = await vendCharacterToken(ENV, 'user-1', 90000001);

    expect(result).toEqual({ kind: 'token', accessToken: 'fresh-token' });
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
    stubFetch(problemResponse('not_found', 404));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual({
      kind: 'skip',
    });
  });

  it('maps 409 to a reauth requirement', async () => {
    stubFetch(problemResponse('reauth_required', 409));

    await expect(vendCharacterToken(ENV, 'user-1', 90000001)).resolves.toEqual({
      kind: 'reauth',
    });
  });

  it.each([401, 500, 502])('maps other non-success status %i to unavailable', async (status) => {
    stubFetch(problemResponse(status === 502 ? 'upstream_error' : 'unauthenticated', status));

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
    // Old behavior: the asserted cast handed `{accessToken: undefined}` to the
    // caller. The contract now rejects the body and the vend reports it.
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

describe('fetchEnumeratedCharacters', () => {
  const character = {
    characterId: 90000001,
    name: 'Pilot',
    hasRefreshToken: true,
    missingScopes: [],
    corporationId: 98000001,
  };

  it('returns the enumerated characters with service auth applied', async () => {
    const fetchMock = stubFetch(Response.json({ characters: [character] }));

    await expect(fetchEnumeratedCharacters(ENV, 'user-1')).resolves.toEqual([character]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.test/api/internal/eve-characters',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: 'user-1' }),
        headers: expect.objectContaining({ Authorization: 'Bearer service-secret' }),
      }),
    );
  });

  it('throws on a declared failure status so the retrier retries', async () => {
    stubFetch(problemResponse('unauthenticated', 401));

    await expect(fetchEnumeratedCharacters(ENV, 'user-1')).rejects.toThrowError(
      'eve-characters returned 401',
    );
  });

  it('throws on an undeclared status', async () => {
    stubFetch(new Response('gateway timeout', { status: 504 }));

    await expect(fetchEnumeratedCharacters(ENV, 'user-1')).rejects.toThrowError(
      'eve-characters response failed its contract',
    );
  });

  it('throws on a drifted success body instead of propagating garbage', async () => {
    // Old behavior: the asserted cast propagated `undefined` characters into
    // the sync flow. The contract now rejects the body.
    stubFetch(Response.json({ characters: [{ characterId: 'not-a-number' }] }));

    await expect(fetchEnumeratedCharacters(ENV, 'user-1')).rejects.toThrowError(
      'eve-characters response failed its contract',
    );
  });

  it('rethrows a transport rejection unchanged', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    await expect(fetchEnumeratedCharacters(ENV, 'user-1')).rejects.toThrowError(
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

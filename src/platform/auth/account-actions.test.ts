import { afterEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';
import { apiFetch } from '@/transport/api-client';
import {
  isDeleteAcknowledged,
  redirectTargetFor,
  runDeleteAccount,
  runLogoutEverywhere,
  runPurgeCharacter,
} from './account-actions';
import { accountDeleteEndpoint, purgeCharacterEndpoint, sessionsRevokeEndpoint } from './api-contract';
import { EVE_AUTHORIZED_APPS_URL } from './eve-sso';

function jsonResponse(data: unknown): Response {
  return Response.json(data, { status: 200 });
}

function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify(
      problemBodySchema.parse({
        type: 'https://lgi.tools/problems/rate_limited',
        title: 'Too many requests',
        status: 429,
        code: 'rate_limited',
        correlationId: 'test-correlation-id',
        retryAfterSeconds: 10,
      }),
    ),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/problem+json',
        'Retry-After': '10',
      },
    },
  );
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runPurgeCharacter', () => {
  it('a one-of-many purge ({accountEmptied:false}) → stayed, and stayed never redirects', async () => {
    const fetchMock = stubFetch(jsonResponse({ accountEmptied: false }));
    const outcome = await runPurgeCharacter(123, apiFetch);
    expect(outcome).toEqual({ kind: 'stayed' });
    expect(redirectTargetFor(outcome)).toBeNull(); // no lightbox, no navigation
    expect(fetchMock).toHaveBeenCalledWith(purgeCharacterEndpoint.path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: 123 }),
    });
  });

  it('a last-character purge ({accountEmptied:true}) → emptied, which redirects to EVE authorized apps', async () => {
    stubFetch(jsonResponse({ accountEmptied: true }));
    const outcome = await runPurgeCharacter(456, apiFetch);
    expect(outcome).toEqual({ kind: 'emptied' });
    expect(redirectTargetFor(outcome)).toBe(EVE_AUTHORIZED_APPS_URL);
  });

  it('a non-2xx purge → error, which does not redirect', async () => {
    stubFetch(rateLimitedResponse());
    const outcome = await runPurgeCharacter(789, apiFetch);
    expect(outcome).toEqual({ kind: 'error' });
    expect(redirectTargetFor(outcome)).toBeNull();
  });

  it('a network-level throw → error, and never rejects (the gate can’t freeze)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(runPurgeCharacter(1, apiFetch)).resolves.toEqual({ kind: 'error' });
  });
});

describe('runDeleteAccount', () => {
  it('success empties the account and redirects to EVE authorized apps', async () => {
    const fetchMock = stubFetch(jsonResponse({ ok: true }));
    const outcome = await runDeleteAccount(apiFetch);
    expect(outcome).toEqual({ kind: 'emptied' });
    expect(redirectTargetFor(outcome)).toBe(EVE_AUTHORIZED_APPS_URL);
    expect(fetchMock).toHaveBeenCalledWith(accountDeleteEndpoint.path, { method: 'POST' });
  });

  it('a non-2xx delete → error', async () => {
    stubFetch(rateLimitedResponse());
    expect(await runDeleteAccount(apiFetch)).toEqual({ kind: 'error' });
  });

  it('a network-level throw → error, and never rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(runDeleteAccount(apiFetch)).resolves.toEqual({ kind: 'error' });
  });
});

describe('runLogoutEverywhere', () => {
  it('calls /sessions/revoke and, on success, sends the now-signed-out browser home', async () => {
    const fetchMock = stubFetch(jsonResponse({ revoked: 3 }));
    const outcome = await runLogoutEverywhere(apiFetch);
    expect(outcome).toEqual({ kind: 'done' });
    expect(fetchMock).toHaveBeenCalledWith(sessionsRevokeEndpoint.path, { method: 'POST' });
    expect(redirectTargetFor(outcome)).toBe('/');
  });

  it('a non-2xx revoke → error, which does not redirect', async () => {
    stubFetch(rateLimitedResponse());
    const outcome = await runLogoutEverywhere(apiFetch);
    expect(outcome).toEqual({ kind: 'error' });
    expect(redirectTargetFor(outcome)).toBeNull();
  });

  it('a network-level throw → error, and never rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(runLogoutEverywhere(apiFetch)).resolves.toEqual({ kind: 'error' });
  });
});

describe('isDeleteAcknowledged', () => {
  it('gates the account delete on the acknowledgement checkbox', () => {
    expect(isDeleteAcknowledged(true)).toBe(true);
    expect(isDeleteAcknowledged(false)).toBe(false);
  });
});

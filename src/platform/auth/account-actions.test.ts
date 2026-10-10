import { afterEach, expect, test, vi } from 'vitest';
import { rateLimitedFailure } from '@/lib/failure';
import { problemBody, serializeProblem } from '@/lib/problem';
import { apiFetch } from '@/transport/api-client';
import {
  redirectTargetFor,
  runDeleteAccount,
  runLogoutEverywhere,
  runPurgeCharacter,
} from './account-actions';
import { accountDeleteEndpoint, purgeCharacterEndpoint, sessionsRevokeEndpoint } from './api-contract';
import { EVE_AUTHORIZED_APPS_URL } from './eve-sso';

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('runPurgeCharacter maps stayed, emptied, HTTP error, and network throw without rejecting', async () => {
  const fetchMock = stubFetch(Response.json({ accountEmptied: false }));
  const stayed = await runPurgeCharacter(123, apiFetch);
  expect(stayed).toEqual({ kind: 'stayed' });
  expect(redirectTargetFor(stayed)).toBeNull();
  expect(fetchMock).toHaveBeenCalledWith(purgeCharacterEndpoint.path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId: 123 }),
  });

  stubFetch(Response.json({ accountEmptied: true }));
  const emptied = await runPurgeCharacter(456, apiFetch);
  expect(emptied).toEqual({ kind: 'emptied' });
  expect(redirectTargetFor(emptied)).toBe(EVE_AUTHORIZED_APPS_URL);

  stubFetch(serializeProblem(problemBody(rateLimitedFailure(10), 'test-correlation-id')));
  const httpError = await runPurgeCharacter(789, apiFetch);
  expect(httpError).toEqual({ kind: 'error' });
  expect(redirectTargetFor(httpError)).toBeNull();

  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
  await expect(runPurgeCharacter(1, apiFetch)).resolves.toEqual({ kind: 'error' });
});

test('runDeleteAccount empties on success and maps HTTP or network failure to error', async () => {
  const fetchMock = stubFetch(Response.json({ ok: true }));
  const outcome = await runDeleteAccount(apiFetch);
  expect(outcome).toEqual({ kind: 'emptied' });
  expect(redirectTargetFor(outcome)).toBe(EVE_AUTHORIZED_APPS_URL);
  expect(fetchMock).toHaveBeenCalledWith(accountDeleteEndpoint.path, { method: 'POST' });

  stubFetch(serializeProblem(problemBody(rateLimitedFailure(10), 'test-correlation-id')));
  expect(await runDeleteAccount(apiFetch)).toEqual({ kind: 'error' });

  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
  await expect(runDeleteAccount(apiFetch)).resolves.toEqual({ kind: 'error' });
});

test('runLogoutEverywhere sends the browser home on success and does not redirect on error', async () => {
  const fetchMock = stubFetch(Response.json({ revoked: 3 }));
  const outcome = await runLogoutEverywhere(apiFetch);
  expect(outcome).toEqual({ kind: 'done' });
  expect(fetchMock).toHaveBeenCalledWith(sessionsRevokeEndpoint.path, { method: 'POST' });
  expect(redirectTargetFor(outcome)).toBe('/');

  stubFetch(serializeProblem(problemBody(rateLimitedFailure(10), 'test-correlation-id')));
  const httpError = await runLogoutEverywhere(apiFetch);
  expect(httpError).toEqual({ kind: 'error' });
  expect(redirectTargetFor(httpError)).toBeNull();

  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
  await expect(runLogoutEverywhere(apiFetch)).resolves.toEqual({ kind: 'error' });
});

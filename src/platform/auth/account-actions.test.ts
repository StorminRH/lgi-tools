import { describe, expect, it, vi } from 'vitest';
import {
  type AccountApiCaller,
  isDeleteAcknowledged,
  redirectTargetFor,
  runDeleteAccount,
  runLogoutEverywhere,
  runPurgeCharacter,
} from './account-actions';
import { accountDeleteEndpoint, purgeCharacterEndpoint, sessionsRevokeEndpoint } from './api-contract';
import { EVE_AUTHORIZED_APPS_URL } from './eve-sso';

// A stubbed apiFetch seam: resolves a fixed result and records its calls. The
// runners only read `res.ok`/`res.data`, so the failure `response` can be a stub.
function okCaller(data: unknown) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, data }));
  return { fn, call: fn as unknown as AccountApiCaller };
}
function errCaller(status = 500) {
  const fn = vi.fn(async () => ({ ok: false, status, response: {} as Response }));
  return { fn, call: fn as unknown as AccountApiCaller };
}
// A caller that REJECTS — the apiFetch network-failure path (offline, DNS, abort),
// where `fetch` throws rather than resolving to a non-2xx `{ ok: false }`.
function throwingCaller() {
  const fn = vi.fn(async () => {
    throw new Error('network down');
  });
  return { fn, call: fn as unknown as AccountApiCaller };
}

describe('runPurgeCharacter', () => {
  it('a one-of-many purge ({accountEmptied:false}) → stayed, and stayed never redirects', async () => {
    const { fn, call } = okCaller({ accountEmptied: false });
    const outcome = await runPurgeCharacter(123, call);
    expect(outcome).toEqual({ kind: 'stayed' });
    expect(redirectTargetFor(outcome)).toBeNull(); // no lightbox, no navigation
    expect(fn).toHaveBeenCalledWith(purgeCharacterEndpoint, { body: { characterId: 123 } });
  });

  it('a last-character purge ({accountEmptied:true}) → emptied, which redirects to EVE authorized apps', async () => {
    const { call } = okCaller({ accountEmptied: true });
    const outcome = await runPurgeCharacter(456, call);
    expect(outcome).toEqual({ kind: 'emptied' });
    expect(redirectTargetFor(outcome)).toBe(EVE_AUTHORIZED_APPS_URL);
  });

  it('a non-2xx purge → error, which does not redirect', async () => {
    const { call } = errCaller(429);
    const outcome = await runPurgeCharacter(789, call);
    expect(outcome).toEqual({ kind: 'error' });
    expect(redirectTargetFor(outcome)).toBeNull();
  });

  it('a network-level throw → error, and never rejects (the gate can’t freeze)', async () => {
    const { call } = throwingCaller();
    await expect(runPurgeCharacter(1, call)).resolves.toEqual({ kind: 'error' });
  });
});

describe('runDeleteAccount', () => {
  it('success empties the account and redirects to EVE authorized apps', async () => {
    const { fn, call } = okCaller({ ok: true });
    const outcome = await runDeleteAccount(call);
    expect(outcome).toEqual({ kind: 'emptied' });
    expect(redirectTargetFor(outcome)).toBe(EVE_AUTHORIZED_APPS_URL);
    expect(fn).toHaveBeenCalledWith(accountDeleteEndpoint);
  });

  it('a non-2xx delete → error', async () => {
    const { call } = errCaller();
    expect(await runDeleteAccount(call)).toEqual({ kind: 'error' });
  });

  it('a network-level throw → error, and never rejects', async () => {
    const { call } = throwingCaller();
    await expect(runDeleteAccount(call)).resolves.toEqual({ kind: 'error' });
  });
});

describe('runLogoutEverywhere', () => {
  it('calls /sessions/revoke and, on success, sends the now-signed-out browser home', async () => {
    const { fn, call } = okCaller({ revoked: 3 });
    const outcome = await runLogoutEverywhere(call);
    expect(outcome).toEqual({ kind: 'done' });
    expect(fn).toHaveBeenCalledWith(sessionsRevokeEndpoint);
    expect(redirectTargetFor(outcome)).toBe('/');
  });

  it('a non-2xx revoke → error, which does not redirect', async () => {
    const { call } = errCaller();
    const outcome = await runLogoutEverywhere(call);
    expect(outcome).toEqual({ kind: 'error' });
    expect(redirectTargetFor(outcome)).toBeNull();
  });

  it('a network-level throw → error, and never rejects', async () => {
    const { call } = throwingCaller();
    await expect(runLogoutEverywhere(call)).resolves.toEqual({ kind: 'error' });
  });
});

describe('isDeleteAcknowledged', () => {
  it('gates the account delete on the acknowledgement checkbox', () => {
    expect(isDeleteAcknowledged(true)).toBe(true);
    expect(isDeleteAcknowledged(false)).toBe(false);
  });
});

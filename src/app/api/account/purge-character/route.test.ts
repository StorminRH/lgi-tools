import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The route purges one of the caller's own characters. Mock the auth instance +
// query layer so these exercise the session gate, the ownership guard, and the
// identity-free counter (D-6) without a DB or a real purge.

const SESSION = {
  user: { id: 'eve-user-1' },
  session: {},
  characterId: 100,
  name: 'Alice',
  portraitUrl: 'a',
  role: 'USER' as const,
  isAdmin: false,
};

const getSessionMock = vi.fn();
const accountBelongsToUserMock = vi.fn();
const purgeOwnCharacterMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  accountBelongsToUser: (u: string, c: number) => accountBelongsToUserMock(u, c),
}));

vi.mock('@/composition/account-lifecycle/account-purge', () => ({
  purgeOwnCharacter: (u: string, c: number) => purgeOwnCharacterMock(u, c),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { POST } from './route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/purge-character', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/account/purge-character', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    accountBelongsToUserMock.mockReset();
    purgeOwnCharacterMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('returns 401 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ characterId: 200 }));
    expect(res.status).toBe(401);
    expect(purgeOwnCharacterMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid character id', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const res = await POST(buildRequest({ characterId: 'not-a-number' }));
    expect(res.status).toBe(400);
    expect(purgeOwnCharacterMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the character is not linked to the caller (ownership guard)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    accountBelongsToUserMock.mockResolvedValue(false);
    const res = await POST(buildRequest({ characterId: 999 }));
    expect(res.status).toBe(400);
    expect(purgeOwnCharacterMock).not.toHaveBeenCalled();
  });

  it('purges the caller\'s own character and returns accountEmptied', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    purgeOwnCharacterMock.mockResolvedValue({ accountEmptied: true });
    const res = await POST(buildRequest({ characterId: 200 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accountEmptied: true });
    expect(purgeOwnCharacterMock).toHaveBeenCalledWith('eve-user-1', 200);
  });

  it('logs an IDENTITY-FREE purge counter — no character id (D-6)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    purgeOwnCharacterMock.mockResolvedValue({ accountEmptied: false });
    await POST(buildRequest({ characterId: 200 }));
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
    const logged = logUsageEventMock.mock.calls[0]![0];
    expect(logged).toEqual({ action: 'account_purge', metadata: { scope: 'character' } });
    expect(logged).not.toHaveProperty('characterId');
  });
});

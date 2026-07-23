import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The route sets the signed-in user's active character. Mock the auth instance +
// query layer so these exercise the session gate and the ownership guard (the
// security-critical line) without a DB.

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
const setActiveCharacterMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  accountBelongsToUser: (u: string, c: number) => accountBelongsToUserMock(u, c),
  setActiveCharacter: (u: string, c: number) => setActiveCharacterMock(u, c),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

// Static import — the mocks above are hoisted, and the route module holds no
// per-test state (only the mocked functions vary, reset in beforeEach), so a
// single import avoids the heavy per-test re-import the resetModules pattern costs.
import { POST } from './route';

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/active-character', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

describe('POST /api/account/active-character', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    accountBelongsToUserMock.mockReset();
    setActiveCharacterMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('returns 401 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ characterId: '200' }));
    expect(res.status).toBe(401);
    expect(setActiveCharacterMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid character id', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const res = await POST(buildRequest({ characterId: 'not-a-number' }));
    expect(res.status).toBe(400);
    expect(setActiveCharacterMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the character is not linked to the caller (ownership guard)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    accountBelongsToUserMock.mockResolvedValue(false);
    const res = await POST(buildRequest({ characterId: '999' }));
    expect(res.status).toBe(400);
    expect(setActiveCharacterMock).not.toHaveBeenCalled();
  });

  it('sets the active character and redirects on a valid switch', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    setActiveCharacterMock.mockResolvedValue(undefined);
    const res = await POST(buildRequest({ characterId: '200' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/characters');
    expect(setActiveCharacterMock).toHaveBeenCalledWith('eve-user-1', 200);
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });
});

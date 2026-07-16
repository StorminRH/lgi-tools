import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The route nukes the caller's entire account. Mock auth + the nuke orchestration so
// these exercise the session gate + the identity-free counter without a DB.

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
const nukeAccountMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/features/auth/account-purge', () => ({
  nukeAccount: (u: string) => nukeAccountMock(u),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { POST } from './route';

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/delete', { method: 'POST' });
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    nukeAccountMock.mockReset();
    nukeAccountMock.mockResolvedValue(undefined);
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('returns 401 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(nukeAccountMock).not.toHaveBeenCalled();
  });

  it('nukes the caller\'s own account and returns ok', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(nukeAccountMock).toHaveBeenCalledWith('eve-user-1');
  });

  it('logs an IDENTITY-FREE purge counter with the account scope (D-6)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    await POST(buildRequest());
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
    const logged = logUsageEventMock.mock.calls[0]![0];
    expect(logged).toEqual({ action: 'account_purge', metadata: { scope: 'account' } });
    expect(logged).not.toHaveProperty('characterId');
  });
});

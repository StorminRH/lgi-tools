import { NextRequest } from 'next/server';
import { beforeEach, expect, test, vi } from 'vitest';

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

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/composition/account-lifecycle/account-purge', () => ({
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

beforeEach(() => {
  getSessionMock.mockReset();
  nukeAccountMock.mockReset();
  nukeAccountMock.mockResolvedValue(undefined);
  logUsageEventMock.mockReset();
  logUsageEventMock.mockResolvedValue(undefined);
});

test('refuses anonymous callers and nukes the signed-in account with an identity-free counter', async () => {
  getSessionMock.mockResolvedValue(null);
  const unauthenticated = await POST(buildRequest());
  expect(unauthenticated.status).toBe(401);
  expect(nukeAccountMock).not.toHaveBeenCalled();

  getSessionMock.mockResolvedValue(SESSION);
  const res = await POST(buildRequest());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(nukeAccountMock).toHaveBeenCalledWith('eve-user-1');
  expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  const logged = logUsageEventMock.mock.calls[0]![0];
  expect(logged).toEqual({ action: 'account_purge', metadata: { scope: 'account' } });
  expect(logged).not.toHaveProperty('characterId');
});

import { beforeEach, expect, test, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const SESSION = sessionFixture();

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
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

import { postEmpty } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/account/delete';

beforeEach(() => {
  getSessionMock.mockReset();
  nukeAccountMock.mockReset();
  nukeAccountMock.mockResolvedValue(undefined);
  logUsageEventMock.mockReset();
  logUsageEventMock.mockResolvedValue(undefined);
});

test('refuses anonymous callers and nukes the signed-in account with an identity-free counter', async () => {
  getSessionMock.mockResolvedValue(null);
  const unauthenticated = await POST(postEmpty(ROUTE));
  expect(unauthenticated.status).toBe(401);
  expect(nukeAccountMock).not.toHaveBeenCalled();

  getSessionMock.mockResolvedValue(SESSION);
  const res = await POST(postEmpty(ROUTE));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(nukeAccountMock).toHaveBeenCalledWith('eve-user-1');
  expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  const logged = logUsageEventMock.mock.calls[0]![0];
  expect(logged).toEqual({ action: 'account_purge', metadata: { scope: 'account' } });
  expect(logged).not.toHaveProperty('characterId');
});

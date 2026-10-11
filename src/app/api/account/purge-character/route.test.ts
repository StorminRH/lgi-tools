import { beforeEach, expect, test, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const SESSION = sessionFixture();

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const accountBelongsToUserMock = vi.fn();
const purgeOwnCharacterMock = vi.fn();
const emitUsageEventMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/auth/linked-characters')>()),
  accountBelongsToUser: (u: string, c: number) => accountBelongsToUserMock(u, c),
}));

vi.mock('@/composition/account-lifecycle/account-purge', () => ({
  purgeOwnCharacter: (u: string, c: number) => purgeOwnCharacterMock(u, c),
}));

vi.mock('@/data/telemetry/usage-events', () => ({
  emitUsageEvent: (scope: string, input: unknown) => emitUsageEventMock(scope, input),
}));
// Capability outcomes also reach emitUsageEvent, through cost-metrics; keep them out of the events under test.
vi.mock('@/data/telemetry/cost-metrics', () => ({ emitCostMetric: vi.fn() }));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// The guard reads through getFullSession, which schedules the authorization check after the response.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/account/purge-character';

beforeEach(() => {
  getSessionMock.mockReset();
  accountBelongsToUserMock.mockReset();
  purgeOwnCharacterMock.mockReset();
  emitUsageEventMock.mockReset();
});

test('refuses anonymous, invalid, and unowned character purges', async () => {
  getSessionMock.mockResolvedValue(null);
  expect((await POST(postJson(ROUTE, { characterId: 200 }))).status).toBe(401);

  getSessionMock.mockResolvedValue(SESSION);
  expect((await POST(postJson(ROUTE, { characterId: 'not-a-number' }))).status).toBe(400);

  accountBelongsToUserMock.mockResolvedValue(false);
  const unowned = await POST(postJson(ROUTE, { characterId: 999 }));
  expect(unowned.status).toBe(400);
  expect(await unowned.json()).toMatchObject({ code: 'not_linked' });
  expect(purgeOwnCharacterMock).not.toHaveBeenCalled();
});

test('purges the caller\'s own character and logs an identity-free counter', async () => {
  getSessionMock.mockResolvedValue(SESSION);
  accountBelongsToUserMock.mockResolvedValue(true);
  purgeOwnCharacterMock.mockResolvedValue({ accountEmptied: true });
  const res = await POST(postJson(ROUTE, { characterId: 200 }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ accountEmptied: true });
  expect(purgeOwnCharacterMock).toHaveBeenCalledWith('eve-user-1', 200);
  expect(emitUsageEventMock).toHaveBeenCalledTimes(1);
  const [scope, logged] = emitUsageEventMock.mock.calls[0]!;
  expect(scope).toBe('account/purge-character');
  expect(logged).toEqual({ action: 'account_purge', metadata: { scope: 'character' } });
  expect(logged).not.toHaveProperty('characterId');
});

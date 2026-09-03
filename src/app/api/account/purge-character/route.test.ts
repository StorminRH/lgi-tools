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
const accountBelongsToUserMock = vi.fn();
const purgeOwnCharacterMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/composition/auth', () => ({
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

beforeEach(() => {
  getSessionMock.mockReset();
  accountBelongsToUserMock.mockReset();
  purgeOwnCharacterMock.mockReset();
  logUsageEventMock.mockReset();
  logUsageEventMock.mockResolvedValue(undefined);
});

test('refuses anonymous, invalid, and unowned character purges', async () => {
  getSessionMock.mockResolvedValue(null);
  expect((await POST(buildRequest({ characterId: 200 }))).status).toBe(401);

  getSessionMock.mockResolvedValue(SESSION);
  expect((await POST(buildRequest({ characterId: 'not-a-number' }))).status).toBe(400);

  accountBelongsToUserMock.mockResolvedValue(false);
  expect((await POST(buildRequest({ characterId: 999 }))).status).toBe(400);
  expect(purgeOwnCharacterMock).not.toHaveBeenCalled();
});

test('purges the caller\'s own character and logs an identity-free counter', async () => {
  getSessionMock.mockResolvedValue(SESSION);
  accountBelongsToUserMock.mockResolvedValue(true);
  purgeOwnCharacterMock.mockResolvedValue({ accountEmptied: true });
  const res = await POST(buildRequest({ characterId: 200 }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ accountEmptied: true });
  expect(purgeOwnCharacterMock).toHaveBeenCalledWith('eve-user-1', 200);
  expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  const logged = logUsageEventMock.mock.calls[0]![0];
  expect(logged).toEqual({ action: 'account_purge', metadata: { scope: 'character' } });
  expect(logged).not.toHaveProperty('characterId');
});

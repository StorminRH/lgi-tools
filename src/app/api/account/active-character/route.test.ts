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

import { POST } from './route';

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/active-character', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

beforeEach(() => {
  getSessionMock.mockReset();
  accountBelongsToUserMock.mockReset();
  setActiveCharacterMock.mockReset();
  logUsageEventMock.mockReset();
  logUsageEventMock.mockResolvedValue(undefined);
});

test('refuses anonymous, invalid, and unowned character switches', async () => {
  getSessionMock.mockResolvedValue(null);
  expect((await POST(buildRequest({ characterId: '200' }))).status).toBe(401);

  getSessionMock.mockResolvedValue(SESSION);
  expect((await POST(buildRequest({ characterId: 'not-a-number' }))).status).toBe(400);

  accountBelongsToUserMock.mockResolvedValue(false);
  expect((await POST(buildRequest({ characterId: '999' }))).status).toBe(400);
  expect(setActiveCharacterMock).not.toHaveBeenCalled();
});

test('sets the active character and redirects on a valid switch', async () => {
  getSessionMock.mockResolvedValue(SESSION);
  accountBelongsToUserMock.mockResolvedValue(true);
  setActiveCharacterMock.mockResolvedValue(undefined);
  const res = await POST(buildRequest({ characterId: '200' }));
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe('http://localhost:3000/characters');
  expect(setActiveCharacterMock).toHaveBeenCalledWith('eve-user-1', 200);
  expect(logUsageEventMock).toHaveBeenCalledTimes(1);
});

import { beforeEach, expect, test, vi } from 'vitest';
import { adminSessionFixture, sessionFixture } from '@/composition/__tests__/session-fixture';

const h = vi.hoisted(() => ({
  getSessionMock: vi.fn<() => Promise<BetterAuthSession | null>>(),
  redirectMock: vi.fn(),
  afterMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock('next/server', () => ({ after: h.afterMock, connection: () => Promise.resolve() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    h.redirectMock(url);
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: h.getSessionMock } },
}));

import {
  checkAdmin,
  checkSession,
  checkUserId,
  requireAdminPage,
  requireSessionPage,
  type BetterAuthSession,
} from './route-guards';

const MEMBER = sessionFixture({ user: { id: 'user-1' }, characterId: 90000001 });
const ADMIN = adminSessionFixture({ user: { id: 'admin-1' }, characterId: 90000002 });

beforeEach(() => {
  h.getSessionMock.mockReset();
  h.redirectMock.mockReset();
  h.afterMock.mockReset();
});

test('checkSession and checkUserId return typed unauthenticated failures or the signed-in identity', async () => {
  h.getSessionMock.mockResolvedValue(null);
  await expect(checkSession()).resolves.toEqual({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  await expect(checkUserId()).resolves.toEqual({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });

  expect(h.afterMock).not.toHaveBeenCalled();

  h.getSessionMock.mockResolvedValue(MEMBER);
  await expect(checkSession()).resolves.toEqual({ ok: true, session: MEMBER });
  // checkSession reads through getFullSession, so a signed-in request schedules the character-authorization check.
  expect(h.afterMock).toHaveBeenCalledOnce();
  await expect(checkUserId()).resolves.toEqual({ ok: true, userId: 'user-1' });
  expect(h.afterMock).toHaveBeenCalledTimes(2);
});

test('checkAdmin uses forbidden for anonymous and non-admin callers and hands back an admin session', async () => {
  h.getSessionMock.mockResolvedValueOnce(null).mockResolvedValueOnce(MEMBER).mockResolvedValueOnce(ADMIN);
  await expect(checkAdmin()).resolves.toEqual({
    ok: false,
    failure: { category: 'forbidden', code: 'forbidden' },
  });
  await expect(checkAdmin()).resolves.toEqual({
    ok: false,
    failure: { category: 'forbidden', code: 'forbidden' },
  });
  await expect(checkAdmin()).resolves.toEqual({ ok: true, session: ADMIN });
  // Through getFullSession, every signed-in caller schedules the check, a forbidden member included.
  expect(h.afterMock).toHaveBeenCalledTimes(2);
});

test('requireAdminPage redirects anonymous and non-admin callers and returns an admin session', async () => {
  h.getSessionMock.mockResolvedValue(null);
  await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT');
  expect(h.redirectMock).toHaveBeenCalledWith('/?auth_error=admin_required');

  h.redirectMock.mockClear();
  h.getSessionMock.mockResolvedValue(MEMBER);
  await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT');
  expect(h.redirectMock).toHaveBeenCalledWith('/?auth_error=admin_required');

  h.redirectMock.mockClear();
  h.getSessionMock.mockResolvedValue(ADMIN);
  await expect(requireAdminPage()).resolves.toEqual(ADMIN);
  expect(h.redirectMock).not.toHaveBeenCalled();
});

test('requireSessionPage sends a signed-out visitor home with the login notice and returns any signed-in session', async () => {
  h.getSessionMock.mockResolvedValue(null);
  await expect(requireSessionPage()).rejects.toThrow('NEXT_REDIRECT');
  expect(h.redirectMock).toHaveBeenCalledWith('/?auth_error=login_required');
  expect(h.afterMock).not.toHaveBeenCalled();

  h.redirectMock.mockClear();
  h.getSessionMock.mockResolvedValue(MEMBER);
  await expect(requireSessionPage()).resolves.toEqual(MEMBER);
  expect(h.redirectMock).not.toHaveBeenCalled();
  // The page guard reads through getFullSession, so the character-authorization check still runs after the render.
  expect(h.afterMock).toHaveBeenCalledOnce();
});

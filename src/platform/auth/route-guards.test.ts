import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  redirectMock: vi.fn(),
  requireSameOriginMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    h.redirectMock(url);
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: h.getSessionMock } },
}));
vi.mock('./same-origin', () => ({
  requireSameOrigin: (...args: unknown[]) => h.requireSameOriginMock(...args),
}));

import {
  checkAdmin,
  checkAdminMutation,
  checkSession,
  checkUserId,
  requireAdminPage,
} from './route-guards';

const MEMBER = { user: { id: 'user-1' }, characterId: 90000001, isAdmin: false };
const ADMIN = { user: { id: 'admin-1' }, characterId: 90000002, isAdmin: true };
const REQUEST = new Request('https://lgi.tools/api/admin/role', { method: 'POST' });

beforeEach(() => {
  h.getSessionMock.mockReset();
  h.redirectMock.mockReset();
  h.requireSameOriginMock.mockReset();
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

  h.getSessionMock.mockResolvedValue(MEMBER);
  await expect(checkSession()).resolves.toEqual({ ok: true, session: MEMBER });
  await expect(checkUserId()).resolves.toEqual({ ok: true, userId: 'user-1' });
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
});

test('checkAdminMutation refuses non-admins, then applies the same-origin gate', async () => {
  h.getSessionMock.mockResolvedValueOnce(null).mockResolvedValueOnce(MEMBER);
  await expect(checkAdminMutation(REQUEST)).resolves.toEqual({
    ok: false,
    failure: { category: 'forbidden', code: 'forbidden' },
  });
  await expect(checkAdminMutation(REQUEST)).resolves.toEqual({
    ok: false,
    failure: { category: 'forbidden', code: 'forbidden' },
  });
  expect(h.requireSameOriginMock).not.toHaveBeenCalled();

  h.getSessionMock.mockResolvedValue(ADMIN);
  h.requireSameOriginMock.mockReturnValueOnce({
    ok: false,
    failure: { category: 'forbidden', code: 'cross_origin' },
  });
  await expect(checkAdminMutation(REQUEST)).resolves.toEqual({
    ok: false,
    failure: { category: 'forbidden', code: 'cross_origin' },
  });
  expect(h.requireSameOriginMock).toHaveBeenCalledWith(REQUEST);

  h.requireSameOriginMock.mockReturnValueOnce({ ok: true });
  await expect(checkAdminMutation(REQUEST)).resolves.toEqual({ ok: true, session: ADMIN });
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

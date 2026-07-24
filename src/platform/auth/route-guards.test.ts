import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getSessionMock: vi.fn(), redirectMock: vi.fn() }));

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

import {
  checkAdmin,
  checkSession,
  checkUserId,
  requireAdminPage,
} from './route-guards';

const MEMBER = { user: { id: 'user-1' }, characterId: 90000001, isAdmin: false };
const ADMIN = { user: { id: 'admin-1' }, characterId: 90000002, isAdmin: true };

beforeEach(() => {
  h.getSessionMock.mockReset();
  h.redirectMock.mockReset();
});

describe('checkSession', () => {
  it('returns a typed unauthenticated failure without a response', async () => {
    h.getSessionMock.mockResolvedValue(null);
    await expect(checkSession()).resolves.toEqual({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
  });

  it('hands back the Better Auth session for a signed-in caller', async () => {
    h.getSessionMock.mockResolvedValue(MEMBER);
    await expect(checkSession()).resolves.toEqual({ ok: true, session: MEMBER });
  });
});

describe('checkAdmin', () => {
  it('uses the forbidden category for anonymous and non-admin callers', async () => {
    h.getSessionMock.mockResolvedValueOnce(null).mockResolvedValueOnce(MEMBER);
    await expect(checkAdmin()).resolves.toEqual({
      ok: false,
      failure: { category: 'forbidden', code: 'forbidden' },
    });
    await expect(checkAdmin()).resolves.toEqual({
      ok: false,
      failure: { category: 'forbidden', code: 'forbidden' },
    });
  });

  it('hands back the session for an admin', async () => {
    h.getSessionMock.mockResolvedValue(ADMIN);
    await expect(checkAdmin()).resolves.toEqual({ ok: true, session: ADMIN });
  });
});

describe('checkUserId', () => {
  it('returns a typed unauthenticated failure without a response', async () => {
    h.getSessionMock.mockResolvedValue(null);
    await expect(checkUserId()).resolves.toEqual({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
  });

  it('hands back the Better Auth user id for a signed-in caller', async () => {
    h.getSessionMock.mockResolvedValue(MEMBER);
    await expect(checkUserId()).resolves.toEqual({ ok: true, userId: 'user-1' });
  });
});

describe('requireAdminPage', () => {
  it('redirects an anonymous caller to the auth-error landing', async () => {
    h.getSessionMock.mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirectMock).toHaveBeenCalledWith('/?auth_error=admin_required');
  });

  it('redirects a signed-in non-admin', async () => {
    h.getSessionMock.mockResolvedValue(MEMBER);
    await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirectMock).toHaveBeenCalledWith('/?auth_error=admin_required');
  });

  it('returns the session for an admin without redirecting', async () => {
    h.getSessionMock.mockResolvedValue(ADMIN);
    const session = await requireAdminPage();
    expect(session).toEqual(ADMIN);
    expect(h.redirectMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getSessionMock: vi.fn(), redirectMock: vi.fn() }));

vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    h.redirectMock(url);
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: h.getSessionMock } },
}));

import { requireAdmin, requireAdminPage, requireSession, requireUserId } from './route-guards';

const MEMBER = { user: { id: 'user-1' }, characterId: 90000001, isAdmin: false };
const ADMIN = { user: { id: 'admin-1' }, characterId: 90000002, isAdmin: true };

beforeEach(() => {
  h.getSessionMock.mockReset();
  h.redirectMock.mockReset();
});

describe('requireSession', () => {
  it('returns 401 Unauthorized for an anonymous caller', async () => {
    h.getSessionMock.mockResolvedValue(null);
    const gate = await requireSession();
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
      expect(await gate.response.text()).toBe('Unauthorized');
    }
  });

  it('hands back the Better Auth session for a signed-in caller', async () => {
    h.getSessionMock.mockResolvedValue(MEMBER);
    const gate = await requireSession();
    expect(gate).toEqual({ ok: true, session: MEMBER });
  });
});

describe('requireAdmin', () => {
  it('returns 403 Forbidden for an anonymous caller', async () => {
    h.getSessionMock.mockResolvedValue(null);
    const gate = await requireAdmin();
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      expect(await gate.response.text()).toBe('Forbidden');
    }
  });

  it('returns 403 for a signed-in non-admin', async () => {
    h.getSessionMock.mockResolvedValue(MEMBER);
    const gate = await requireAdmin();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('hands back the session for an admin', async () => {
    h.getSessionMock.mockResolvedValue(ADMIN);
    const gate = await requireAdmin();
    expect(gate).toEqual({ ok: true, session: ADMIN });
  });
});

describe('requireUserId', () => {
  it('returns 401 Unauthorized for an anonymous caller', async () => {
    h.getSessionMock.mockResolvedValue(null);
    const gate = await requireUserId();
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
      expect(await gate.response.text()).toBe('Unauthorized');
    }
  });

  it('hands back the Better Auth user id for a signed-in caller', async () => {
    h.getSessionMock.mockResolvedValue(MEMBER);
    const gate = await requireUserId();
    expect(gate).toEqual({ ok: true, userId: 'user-1' });
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

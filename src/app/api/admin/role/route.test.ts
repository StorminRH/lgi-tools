import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/features/auth/admin-users';

// The route reads the viewer (admin gate + own userId) straight off the Better
// Auth session and mutates per-user roles. Mock the auth instance + query layer
// so these exercise the guards without a DB.

const ADMIN_VIEWER = {
  user: { id: 'eve-user-1000000000' },
  session: {},
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
  role: 'ADMIN' as const,
  isAdmin: true,
};

const TARGET_USER: AdminUser = {
  userId: 'eve-user-12345',
  characterId: 12345,
  name: 'Target',
  portraitUrl: 'https://images.evetech.net/characters/12345/portrait?size=128',
  role: 'USER',
};

const getSessionMock = vi.fn();
const getUserByIdMock = vi.fn();
const setUserRoleMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/features/auth/admin-users', () => ({
  getUserById: (id: string) => getUserByIdMock(id),
  setUserRole: (id: string, role: string) => setUserRoleMock(id, role),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

async function importRoute() {
  return await import('./route');
}

function buildRequest(form: Record<string, string>): NextRequest {
  const body = new URLSearchParams(form).toString();
  return new NextRequest('http://localhost:3000/api/admin/role', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

describe('POST /api/admin/role', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    getUserByIdMock.mockReset();
    setUserRoleMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ userId: 'eve-user-12345', nextRole: 'ADMIN' }));
    expect(res.status).toBe(403);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not an admin', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_VIEWER, isAdmin: false });
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ userId: 'eve-user-12345', nextRole: 'ADMIN' }));
    expect(res.status).toBe(403);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the caller tries to toggle their own role', async () => {
    getSessionMock.mockResolvedValue(ADMIN_VIEWER);
    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ userId: ADMIN_VIEWER.user.id, nextRole: 'USER' }),
    );
    expect(res.status).toBe(400);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('returns 400 when nextRole is not in CHARACTER_ROLES', async () => {
    getSessionMock.mockResolvedValue(ADMIN_VIEWER);
    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ userId: 'eve-user-12345', nextRole: 'SUPERADMIN' }),
    );
    expect(res.status).toBe(400);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    getSessionMock.mockResolvedValue(ADMIN_VIEWER);
    getUserByIdMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ userId: 'eve-user-99999', nextRole: 'ADMIN' }));
    expect(res.status).toBe(404);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('mutates the role and redirects on a valid request', async () => {
    getSessionMock.mockResolvedValue(ADMIN_VIEWER);
    getUserByIdMock.mockResolvedValue(TARGET_USER);
    setUserRoleMock.mockResolvedValue({ ...TARGET_USER, role: 'ADMIN' });
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ userId: TARGET_USER.userId, nextRole: 'ADMIN' }));
    expect(res.status).toBe(303);
    expect(setUserRoleMock).toHaveBeenCalledWith(TARGET_USER.userId, 'ADMIN');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });
});

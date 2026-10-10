import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';
import { postForm } from '@/lib/__tests__/route-requests';
import type { AdminUser } from '@/platform/auth/admin-users';

const ADMIN_VIEWER = adminSessionFixture({
  user: { id: 'eve-user-1000000000' },
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
});

const TARGET_USER: AdminUser = {
  userId: 'eve-user-12345',
  characterId: 12345,
  name: 'Target',
  portraitUrl: 'https://images.evetech.net/characters/12345/portrait?size=128',
  role: 'USER',
};

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const getUserByIdMock = vi.fn();
const setUserRoleMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/admin-users', () => ({
  getUserById: (id: string) => getUserByIdMock(id),
  setUserRole: (id: string, role: string) => setUserRoleMock(id, role),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const ROUTE = '/api/admin/role';

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

  it('returns 403 for a non-admin and for no session at all', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_VIEWER, isAdmin: false });
    const { POST } = await import('./route');
    const res = await POST(postForm(ROUTE, { userId: 'eve-user-12345', nextRole: 'ADMIN' }));
    expect(res.status).toBe(403);

    getSessionMock.mockResolvedValue(null);
    const anonymous = await POST(postForm(ROUTE, { userId: 'eve-user-12345', nextRole: 'ADMIN' }));
    expect(anonymous.status).toBe(403);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('returns 400 for self-toggle or an unknown role, and 404 when the target is missing', async () => {
    getSessionMock.mockResolvedValue(ADMIN_VIEWER);
    const { POST } = await import('./route');

    expect(
      (await POST(postForm(ROUTE, { userId: ADMIN_VIEWER.user.id, nextRole: 'USER' }))).status,
    ).toBe(400);
    expect(
      (await POST(postForm(ROUTE, { userId: 'eve-user-12345', nextRole: 'SUPERADMIN' }))).status,
    ).toBe(400);

    getUserByIdMock.mockResolvedValue(null);
    expect(
      (await POST(postForm(ROUTE, { userId: 'eve-user-99999', nextRole: 'ADMIN' }))).status,
    ).toBe(404);
    expect(setUserRoleMock).not.toHaveBeenCalled();
  });

  it('mutates the role and redirects on a valid request', async () => {
    getSessionMock.mockResolvedValue(ADMIN_VIEWER);
    getUserByIdMock.mockResolvedValue(TARGET_USER);
    setUserRoleMock.mockResolvedValue({ ...TARGET_USER, role: 'ADMIN' });
    const { POST } = await import('./route');
    const res = await POST(postForm(ROUTE, { userId: TARGET_USER.userId, nextRole: 'ADMIN' }));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/admin/users');
    expect(setUserRoleMock).toHaveBeenCalledWith(TARGET_USER.userId, 'ADMIN');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });

  it('carries the sanitised search back to the users page, and drops a blank one', async () => {
    getSessionMock.mockResolvedValue(ADMIN_VIEWER);
    getUserByIdMock.mockResolvedValue(TARGET_USER);
    setUserRoleMock.mockResolvedValue({ ...TARGET_USER, role: 'ADMIN' });
    const { POST } = await import('./route');
    const location = async (q: string) => {
      const res = await POST(postForm(ROUTE, { userId: TARGET_USER.userId, nextRole: 'ADMIN', q }));
      return new URL(res.headers.get('location')!);
    };

    expect((await location('  Pilot\u0007 ')).searchParams.get('q')).toBe('Pilot');
    expect((await location('   ')).searchParams.has('q')).toBe(false);
  });
});

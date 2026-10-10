import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const ADMIN_SESSION = adminSessionFixture({ user: { id: 'admin-1' }, characterId: 1 });

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const getUserByIdMock = vi.fn();
const revokeUserSessionsMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/admin-users', () => ({
  getUserById: (u: string) => getUserByIdMock(u),
  revokeUserSessions: (u: string) => revokeUserSessionsMock(u),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { postForm } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/admin/sessions/revoke';

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

describe('POST /api/admin/sessions/revoke', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getUserByIdMock.mockReset();
    revokeUserSessionsMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('refuses non-admins, a malformed form, self-logout, and a missing user', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    expect((await POST(postForm(ROUTE, { userId: 'eve-user-2' }))).status).toBe(403);

    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    expect((await POST(postForm(ROUTE, {}))).status).toBe(400);
    expect((await POST(postForm(ROUTE, { userId: 'admin-1' }))).status).toBe(400);

    getUserByIdMock.mockResolvedValue(null);
    expect((await POST(postForm(ROUTE, { userId: 'eve-user-2' }))).status).toBe(404);
    expect(revokeUserSessionsMock).not.toHaveBeenCalled();
  });

  it('revokes the user\'s sessions and redirects to their detail page', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    getUserByIdMock.mockResolvedValue({ userId: 'eve-user-2', characterId: 200 });
    revokeUserSessionsMock.mockResolvedValue(3);
    const res = await POST(postForm(ROUTE, { userId: 'eve-user-2' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe('http://localhost:3000/admin/users/eve-user-2');
    expect(revokeUserSessionsMock).toHaveBeenCalledWith('eve-user-2');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });
});

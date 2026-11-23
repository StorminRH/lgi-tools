import { expect, test, vi } from 'vitest';
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
const emitUsageEventMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/admin-users', () => ({
  getUserById: (id: string) => getUserByIdMock(id),
  setUserRole: (id: string, role: string) => setUserRoleMock(id, role),
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
  connection: () => Promise.resolve(),
}));

const ROUTE = '/api/admin/role';

function resetMocks() {
  getSessionMock.mockReset();
  getUserByIdMock.mockReset();
  setUserRoleMock.mockReset();
  emitUsageEventMock.mockReset();
}

test('refuses a non-admin or no session with 403, a self-toggle or unknown role with 400, and a missing target with 404', async () => {
  resetMocks();
  const { POST } = await import('./route');

  getSessionMock.mockResolvedValue({ ...ADMIN_VIEWER, isAdmin: false });
  expect((await POST(postForm(ROUTE, { userId: 'eve-user-12345', nextRole: 'ADMIN' }))).status).toBe(403);
  getSessionMock.mockResolvedValue(null);
  expect((await POST(postForm(ROUTE, { userId: 'eve-user-12345', nextRole: 'ADMIN' }))).status).toBe(403);

  getSessionMock.mockResolvedValue(ADMIN_VIEWER);
  expect((await POST(postForm(ROUTE, { userId: ADMIN_VIEWER.user.id, nextRole: 'USER' }))).status).toBe(400);
  expect((await POST(postForm(ROUTE, { userId: 'eve-user-12345', nextRole: 'SUPERADMIN' }))).status).toBe(400);

  getUserByIdMock.mockResolvedValue(null);
  expect((await POST(postForm(ROUTE, { userId: 'eve-user-99999', nextRole: 'ADMIN' }))).status).toBe(404);
  expect(setUserRoleMock).not.toHaveBeenCalled();
});

test('mutates the role, records it, and redirects to the users page with the sanitised search', async () => {
  resetMocks();
  getSessionMock.mockResolvedValue(ADMIN_VIEWER);
  getUserByIdMock.mockResolvedValue(TARGET_USER);
  setUserRoleMock.mockResolvedValue({ ...TARGET_USER, role: 'ADMIN' });
  const { POST } = await import('./route');

  const res = await POST(postForm(ROUTE, { userId: TARGET_USER.userId, nextRole: 'ADMIN' }));
  expect(res.status).toBe(303);
  expect(new URL(res.headers.get('location')!).pathname).toBe('/admin/users');
  expect(setUserRoleMock).toHaveBeenCalledWith(TARGET_USER.userId, 'ADMIN');
  expect(emitUsageEventMock).toHaveBeenCalledExactlyOnceWith('admin/role', {
    action: 'role_change',
    characterId: ADMIN_VIEWER.characterId,
    metadata: {
      actorUserId: ADMIN_VIEWER.user.id,
      targetUserId: TARGET_USER.userId,
      targetCharacterId: TARGET_USER.characterId,
      from: 'USER',
      to: 'ADMIN',
    },
  });

  const location = async (q: string) => {
    const searched = await POST(postForm(ROUTE, { userId: TARGET_USER.userId, nextRole: 'ADMIN', q }));
    return new URL(searched.headers.get('location')!);
  };
  expect((await location('  Pilot\u0007 ')).searchParams.get('q')).toBe('Pilot');
  expect((await location('   ')).searchParams.has('q')).toBe(false);
});

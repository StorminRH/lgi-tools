import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const ADMIN_SESSION = adminSessionFixture({ user: { id: 'admin-1' }, characterId: 1 });

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const accountBelongsToUserMock = vi.fn();
const reassignCharacterMock = vi.fn();
const emitUsageEventMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  accountBelongsToUser: (u: string, c: number) => accountBelongsToUserMock(u, c),
}));

vi.mock('@/platform/auth/admin-users', () => ({
  reassignCharacter: (args: unknown) => reassignCharacterMock(args),
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

import { postForm } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/admin/characters/reassign';

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

describe('POST /api/admin/characters/reassign', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    accountBelongsToUserMock.mockReset();
    reassignCharacterMock.mockReset();
    emitUsageEventMock.mockReset();
  });

  it('refuses non-admins, a malformed form, a no-op self-move, and an unowned character', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    expect(
      (await POST(postForm(ROUTE, { fromUserId: 'eve-user-2', characterId: '200' }))).status,
    ).toBe(403);

    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    expect((await POST(postForm(ROUTE, { characterId: '200' }))).status).toBe(400);
    expect((await POST(postForm(ROUTE, { fromUserId: 'admin-1', characterId: '200' }))).status).toBe(
      400,
    );

    accountBelongsToUserMock.mockResolvedValue(false);
    expect(
      (await POST(postForm(ROUTE, { fromUserId: 'eve-user-2', characterId: '200' }))).status,
    ).toBe(404);
    expect(reassignCharacterMock).not.toHaveBeenCalled();
  });

  it('moves the character onto the caller and redirects to the caller\'s detail page', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    reassignCharacterMock.mockResolvedValue({ sourceDeleted: true });
    const res = await POST(postForm(ROUTE, { fromUserId: 'eve-user-2', characterId: '200' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe('http://localhost:3000/admin/users/admin-1');
    expect(reassignCharacterMock).toHaveBeenCalledWith({
      characterId: 200,
      fromUserId: 'eve-user-2',
      toUserId: 'admin-1',
      runners: expect.any(Object),
    });
    expect(emitUsageEventMock).toHaveBeenCalledExactlyOnceWith(
      'admin/characters/reassign',
      expect.objectContaining({ action: 'admin_character_reassign', characterId: ADMIN_SESSION.characterId }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const ADMIN_SESSION = adminSessionFixture({ user: { id: 'admin-1' }, characterId: 1 });

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const deleteLinkedCharacterMock = vi.fn();
const listLinkedCharactersMock = vi.fn();
const logUsageEventMock = vi.fn();
const emitCostMetricMock = vi.fn<(action: string, metadata: Record<string, unknown>) => void>();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: (u: string) => listLinkedCharactersMock(u),
}));

vi.mock('@/platform/auth/admin-users', () => ({
  deleteLinkedCharacter: (...args: unknown[]) => deleteLinkedCharacterMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { postForm } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/admin/characters/unlink';

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

/** The capability outcomes the route recorded, in call order. */
function recordedOutcomes() {
  return emitCostMetricMock.mock.calls.flatMap(([action, record]) =>
    action === 'capability_outcome' ? [{ outcome: record.outcome, code: record.code }] : [],
  );
}

const TWO_CHARS = [{ characterId: 100 }, { characterId: 200 }];

describe('POST /api/admin/characters/unlink', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    deleteLinkedCharacterMock.mockReset();
    listLinkedCharactersMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    emitCostMetricMock.mockReset();
  });

  it('refuses non-admins, a malformed form, an unowned character, and the last character', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    expect(
      (await POST(postForm(ROUTE, { userId: 'eve-user-2', characterId: '200' }))).status,
    ).toBe(403);

    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    expect((await POST(postForm(ROUTE, { userId: 'eve-user-2' }))).status).toBe(400);

    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    const unowned = await POST(postForm(ROUTE, { userId: 'eve-user-2', characterId: '999' }));
    expect(unowned.status).toBe(303);
    expect(locationOf(unowned)).toBe('http://localhost:3000/admin/users/eve-user-2?error=not_linked');
    expect(listLinkedCharactersMock).toHaveBeenCalledExactlyOnceWith('eve-user-2');

    listLinkedCharactersMock.mockResolvedValue([{ characterId: 100 }]);
    const last = await POST(postForm(ROUTE, { userId: 'eve-user-2', characterId: '100' }));
    expect(last.status).toBe(303);
    expect(locationOf(last)).toContain('error=last_character');
    expect(deleteLinkedCharacterMock).not.toHaveBeenCalled();
    expect(recordedOutcomes()).toEqual([
      { outcome: 'forbidden', code: 'forbidden' },
      { outcome: 'validation', code: 'invalid_form_field' },
      { outcome: 'not_found', code: 'not_linked' },
      { outcome: 'validation', code: 'last_character' },
    ]);
  });

  it('delegates unlink and active-character repair to the lifecycle operation', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    deleteLinkedCharacterMock.mockResolvedValue(true);

    const active = await POST(postForm(ROUTE, { userId: 'eve-user-2', characterId: '100' }));
    expect(active.status).toBe(303);
    expect(locationOf(active)).toBe('http://localhost:3000/admin/users/eve-user-2');
    expect(deleteLinkedCharacterMock).toHaveBeenCalledWith(
      'eve-user-2',
      100,
      expect.objectContaining({
        runBeforeUserDelete: expect.any(Function),
        runBeforeCharacterUnlink: expect.any(Function),
        runAfterFailedCharacterUnlink: expect.any(Function),
        runAfterCharacterUnlink: expect.any(Function),
        runAfterCharacterLinkChanged: expect.any(Function),
      }),
    );
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
    expect(recordedOutcomes()).toEqual([{ outcome: 'succeeded', code: 'ok' }]);
  });

  it('reports a character removed by a concurrent unlink as a conflict', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    deleteLinkedCharacterMock.mockResolvedValue(false);

    const raced = await POST(postForm(ROUTE, { userId: 'eve-user-2', characterId: '200' }));

    expect(raced.status).toBe(303);
    expect(locationOf(raced)).toBe(
      'http://localhost:3000/admin/users/eve-user-2?error=unlink_failed',
    );
    expect(recordedOutcomes()).toEqual([{ outcome: 'conflict', code: 'unlink_failed' }]);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });
});

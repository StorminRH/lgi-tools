import type { NextRequest } from 'next/server';
import { expect, test, vi } from 'vitest';
import {
  capabilityOutcomeMock,
  recordedCapabilityOutcomes,
} from '@/lib/__tests__/capability-outcomes';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';
import { postForm } from '@/lib/__tests__/route-requests';
import { forbiddenFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';

const ADMIN = adminSessionFixture({ user: { id: 'user-admin' }, characterId: 90_000_001 });

class SnapshotStateError extends Error {
  constructor(
    readonly snapshotId: number,
    readonly status: 'promoted' | 'missing',
  ) {
    super(`Statics snapshot ${snapshotId} is ${status}, not pending`);
  }
}

class EmptySnapshotError extends Error {
  constructor(readonly snapshotId: number) {
    super(`Statics snapshot ${snapshotId} has no assignments to promote`);
  }
}

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const sameOriginMock = vi.fn();
const refreshMock = vi.fn();
const promoteMock = vi.fn();
const rejectMock = vi.fn();
const emitCostMetricMock = capabilityOutcomeMock();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/same-origin', () => ({
  requireSameOrigin: (request: NextRequest) => sameOriginMock(request),
}));

vi.mock('@/composition/wh-statics-refresh', () => ({
  refreshWhStaticsOnDemand: () => refreshMock(),
  promoteWhStaticsSnapshot: (snapshotId: number) => promoteMock(snapshotId),
  rejectWhStaticsSnapshot: (snapshotId: number) => rejectMock(snapshotId),
}));

vi.mock('@/data/wh-statics/queries', () => ({
  WhStaticsEmptySnapshotError: EmptySnapshotError,
  WhStaticsSnapshotStateError: SnapshotStateError,
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// The guard reads through getFullSession, which schedules the authorization check after the response.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
  connection: () => Promise.resolve(),
}));

const ROUTE = '/api/admin/wh-statics';

async function setup() {
  vi.resetModules();
  getSessionMock.mockReset().mockResolvedValue(ADMIN);
  sameOriginMock.mockReset().mockReturnValue({ ok: true });
  refreshMock.mockReset();
  promoteMock.mockReset();
  rejectMock.mockReset();
  emitCostMetricMock.mockReset();
  const { POST } = await import('./route');
  return POST;
}

test('refuses a non-admin before the origin check, a cross-origin post before the form, and an invalid form', async () => {
  const POST = await setup();

  getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
  expect((await POST(postForm(ROUTE, { action: 'refresh' }))).status).toBe(403);
  expect(sameOriginMock).not.toHaveBeenCalled();

  getSessionMock.mockResolvedValue(ADMIN);
  sameOriginMock.mockReturnValue({
    ok: false,
    failure: forbiddenFailure('cross_origin', 'Cross-origin requests are not allowed'),
  });
  const crossOrigin = await POST(postForm(ROUTE, { action: 'refresh' }));
  expect(crossOrigin.status).toBe(403);
  expect(problemBodySchema.parse(await crossOrigin.json())).toMatchObject({ code: 'cross_origin' });

  sameOriginMock.mockReturnValue({ ok: true });
  expect((await POST(postForm(ROUTE, { action: 'apply' }))).status).toBe(400);
  expect((await POST(postForm(ROUTE, { action: 'promote' }))).status).toBe(400);
  expect(refreshMock).not.toHaveBeenCalled();
  expect(promoteMock).not.toHaveBeenCalled();
});

test('runs the on-demand refresh and redirects with each outcome, recording a dead feed and a busy run as failures', async () => {
  const POST = await setup();
  refreshMock
    .mockResolvedValueOnce({ status: 'snapshot-pending' })
    .mockResolvedValueOnce({ status: 'feed-unavailable', reason: 'HTTP 503' })
    .mockResolvedValueOnce({ status: 'busy' });

  for (const outcome of ['snapshot-pending', 'feed-unavailable', 'busy']) {
    const response = await POST(postForm(ROUTE, { action: 'refresh' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`http://localhost:3000/admin/statics?outcome=${outcome}`);
  }
  expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([
    { outcome: 'succeeded', code: 'ok' },
    { outcome: 'dependency_unavailable', code: 'wh_statics_feed_unavailable' },
    { outcome: 'conflict', code: 'wh_statics_refresh_busy' },
  ]);
});

test('promotes or rejects the named pending snapshot, and sends a no-longer-pending or empty one back with a notice', async () => {
  const POST = await setup();
  promoteMock
    .mockResolvedValueOnce({ snapshotId: 7, systemCount: 2_604, assignmentCount: 3_772 })
    .mockRejectedValueOnce(new SnapshotStateError(7, 'promoted'))
    .mockRejectedValueOnce(new EmptySnapshotError(8));
  rejectMock.mockResolvedValue(undefined);
  const location = (response: Response) => {
    expect(response.status).toBe(303);
    return response.headers.get('location');
  };

  expect(location(await POST(postForm(ROUTE, { action: 'promote', snapshotId: '7' })))).toBe(
    'http://localhost:3000/admin/statics?outcome=promoted',
  );
  expect(promoteMock).toHaveBeenCalledWith(7);
  expect(location(await POST(postForm(ROUTE, { action: 'reject', snapshotId: '8' })))).toBe(
    'http://localhost:3000/admin/statics?outcome=rejected',
  );
  expect(rejectMock).toHaveBeenCalledWith(8);

  emitCostMetricMock.mockReset();
  expect(location(await POST(postForm(ROUTE, { action: 'promote', snapshotId: '7' })))).toBe(
    'http://localhost:3000/admin/statics?outcome=snapshot-not-pending',
  );
  expect(location(await POST(postForm(ROUTE, { action: 'promote', snapshotId: '8' })))).toBe(
    'http://localhost:3000/admin/statics?outcome=snapshot-empty',
  );
  expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([
    { outcome: 'conflict', code: 'snapshot_not_pending' },
    { outcome: 'conflict', code: 'snapshot_empty' },
  ]);
});

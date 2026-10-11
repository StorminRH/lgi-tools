import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const logUsageEventMock = vi.fn();
const emitCostMetricMock = vi.fn<(action: string, metadata: Record<string, unknown>) => void>();

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

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const ROUTE = '/api/admin/wh-statics';

/** The capability outcomes the route recorded, in call order. */
function recordedOutcomes() {
  return emitCostMetricMock.mock.calls.flatMap(([action, record]) =>
    action === 'capability_outcome' ? [{ outcome: record.outcome, code: record.code }] : [],
  );
}

describe('POST /api/admin/wh-statics', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset().mockResolvedValue(ADMIN);
    sameOriginMock.mockReset().mockReturnValue({ ok: true });
    refreshMock.mockReset();
    promoteMock.mockReset();
    rejectMock.mockReset();
    logUsageEventMock.mockReset().mockResolvedValue(undefined);
    emitCostMetricMock.mockReset();
  });

  it('refuses a caller without admin authority before the origin check', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { action: 'refresh' }));

    expect(response.status).toBe(403);
    expect(sameOriginMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('returns the cross-origin problem before parsing the form', async () => {
    sameOriginMock.mockReturnValue({
      ok: false,
      failure: forbiddenFailure(
        'cross_origin',
        'Cross-origin requests are not allowed',
      ),
    });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { action: 'refresh' }));

    expect(response.status).toBe(403);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      code: 'cross_origin',
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid action and missing snapshot id through the slice schema', async () => {
    const { POST } = await import('./route');
    const invalidAction = await POST(postForm(ROUTE, { action: 'apply' }));
    const missingSnapshot = await POST(postForm(ROUTE, { action: 'promote' }));

    expect(invalidAction.status).toBe(400);
    expect(missingSnapshot.status).toBe(400);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it('runs the shared on-demand refresh and redirects with its outcome', async () => {
    refreshMock.mockResolvedValue({ status: 'snapshot-pending' });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { action: 'refresh' }));

    expect(refreshMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=snapshot-pending',
    );
    expect(recordedOutcomes()).toEqual([{ outcome: 'succeeded', code: 'ok' }]);
  });

  it('records an unavailable feed and a busy refresh as failures behind the outcome redirect', async () => {
    refreshMock
      .mockResolvedValueOnce({ status: 'feed-unavailable', reason: 'HTTP 503' })
      .mockResolvedValueOnce({ status: 'busy' });
    const { POST } = await import('./route');
    const unavailable = await POST(postForm(ROUTE, { action: 'refresh' }));
    const busy = await POST(postForm(ROUTE, { action: 'refresh' }));

    expect(unavailable.status).toBe(303);
    expect(unavailable.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=feed-unavailable',
    );
    expect(busy.status).toBe(303);
    expect(busy.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=busy',
    );
    expect(recordedOutcomes()).toEqual([
      { outcome: 'dependency_unavailable', code: 'wh_statics_feed_unavailable' },
      { outcome: 'conflict', code: 'wh_statics_refresh_busy' },
    ]);
  });

  it('promotes the named pending snapshot and redirects', async () => {
    promoteMock.mockResolvedValue({
      snapshotId: 7,
      systemCount: 2_604,
      assignmentCount: 3_772,
    });
    const { POST } = await import('./route');
    const response = await POST(
      postForm(ROUTE, { action: 'promote', snapshotId: '7' }),
    );

    expect(promoteMock).toHaveBeenCalledWith(7);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=promoted',
    );
  });

  it('rejects the named pending snapshot and redirects', async () => {
    rejectMock.mockResolvedValue(undefined);
    const { POST } = await import('./route');
    const response = await POST(
      postForm(ROUTE, { action: 'reject', snapshotId: '8' }),
    );

    expect(rejectMock).toHaveBeenCalledWith(8);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=rejected',
    );
  });

  it('sends a no-longer-pending or empty snapshot back to the review page with a notice', async () => {
    promoteMock
      .mockRejectedValueOnce(new SnapshotStateError(7, 'promoted'))
      .mockRejectedValueOnce(new EmptySnapshotError(8));
    const { POST } = await import('./route');
    const stale = await POST(postForm(ROUTE, { action: 'promote', snapshotId: '7' }));
    const empty = await POST(postForm(ROUTE, { action: 'promote', snapshotId: '8' }));

    expect(stale.status).toBe(303);
    expect(stale.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=snapshot-not-pending',
    );
    expect(empty.status).toBe(303);
    expect(empty.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=snapshot-empty',
    );
    expect(recordedOutcomes()).toEqual([
      { outcome: 'conflict', code: 'snapshot_not_pending' },
      { outcome: 'conflict', code: 'snapshot_empty' },
    ]);
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbiddenFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';

const ADMIN = {
  user: { id: 'user-admin' },
  session: {},
  characterId: 90_000_001,
  isAdmin: true,
};

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

const getSessionMock = vi.fn();
const sameOriginMock = vi.fn();
const refreshMock = vi.fn();
const promoteMock = vi.fn();
const rejectMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/platform/auth/auth', () => ({
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

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/wh-statics', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

async function importRoute() {
  return import('./route');
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
  });

  it('refuses a caller without admin authority before the origin check', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ action: 'refresh' }));

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
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ action: 'refresh' }));

    expect(response.status).toBe(403);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      code: 'cross_origin',
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid action and missing snapshot id through the slice schema', async () => {
    const { POST } = await importRoute();
    const invalidAction = await POST(buildRequest({ action: 'apply' }));
    const missingSnapshot = await POST(buildRequest({ action: 'promote' }));

    expect(invalidAction.status).toBe(400);
    expect(missingSnapshot.status).toBe(400);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it('runs the shared on-demand refresh and redirects with its outcome', async () => {
    refreshMock.mockResolvedValue({ status: 'snapshot-pending' });
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ action: 'refresh' }));

    expect(refreshMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=snapshot-pending',
    );
  });

  it('promotes the named pending snapshot and redirects', async () => {
    promoteMock.mockResolvedValue({
      snapshotId: 7,
      systemCount: 2_604,
      assignmentCount: 3_772,
    });
    const { POST } = await importRoute();
    const response = await POST(
      buildRequest({ action: 'promote', snapshotId: '7' }),
    );

    expect(promoteMock).toHaveBeenCalledWith(7);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=promoted',
    );
  });

  it('rejects the named pending snapshot and redirects', async () => {
    rejectMock.mockResolvedValue(undefined);
    const { POST } = await importRoute();
    const response = await POST(
      buildRequest({ action: 'reject', snapshotId: '8' }),
    );

    expect(rejectMock).toHaveBeenCalledWith(8);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/statics?outcome=rejected',
    );
  });

  it('maps a no-longer-pending snapshot to a conflict', async () => {
    promoteMock.mockRejectedValue(new SnapshotStateError(7, 'promoted'));
    const { POST } = await importRoute();
    const response = await POST(
      buildRequest({ action: 'promote', snapshotId: '7' }),
    );

    expect(response.status).toBe(409);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      code: 'snapshot_not_pending',
    });
  });

  it('maps an empty pending snapshot to a conflict', async () => {
    promoteMock.mockRejectedValue(new EmptySnapshotError(7));
    const { POST } = await importRoute();
    const response = await POST(
      buildRequest({ action: 'promote', snapshotId: '7' }),
    );

    expect(response.status).toBe(409);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      code: 'snapshot_empty',
    });
  });
});

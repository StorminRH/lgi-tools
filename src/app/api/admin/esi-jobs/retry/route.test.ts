import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';
import { postForm } from '@/lib/__tests__/route-requests';
import { forbiddenFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';

const ADMIN = adminSessionFixture({ user: { id: 'user-admin' }, characterId: 90_000_001 });

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const requeueMock = vi.fn();
const emitUsageEventMock = vi.fn();
const sameOriginMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/data/esi-refresh-jobs/queries', () => ({
  requeueDeadLetteredJob: (id: number) => requeueMock(id),
}));

vi.mock('@/data/telemetry/usage-events', () => ({
  emitUsageEvent: (scope: string, input: unknown) => emitUsageEventMock(scope, input),
}));
// Capability outcomes also reach emitUsageEvent, through cost-metrics; keep them out of the events under test.
vi.mock('@/data/telemetry/cost-metrics', () => ({ emitCostMetric: vi.fn() }));

vi.mock('@/platform/auth/same-origin', () => ({
  requireSameOrigin: (request: NextRequest) => sameOriginMock(request),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// The guard reads through getFullSession, which schedules the authorization check after the response.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));

const ROUTE = '/api/admin/esi-jobs/retry';

describe('POST /api/admin/esi-jobs/retry', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    requeueMock.mockReset();
    emitUsageEventMock.mockReset();
    sameOriginMock.mockReset().mockReturnValue({ ok: true });
  });

  it('returns 403 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { jobId: '7' }));
    expect(response.status).toBe(403);
    expect(requeueMock).not.toHaveBeenCalled();
    expect(sameOriginMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not an admin', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { jobId: '7' }));
    expect(response.status).toBe(403);
    expect(requeueMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid job id', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { POST } = await import('./route');
    const request = postForm(ROUTE, { jobId: 'not-a-number' });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(sameOriginMock).toHaveBeenCalledWith(request);
    expect(requeueMock).not.toHaveBeenCalled();
  });

  it('returns the mapped cross-origin problem before parsing', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    sameOriginMock.mockReturnValue({
      ok: false,
      failure: forbiddenFailure(
        'cross_origin',
        'Cross-origin requests are not allowed',
      ),
    });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { jobId: '7' }));

    expect(response.status).toBe(403);
    expect(response.headers.get('Content-Type')).toBe(
      'application/problem+json',
    );
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      type: 'https://lgi.tools/problems/forbidden',
      code: 'cross_origin',
    });
    expect(requeueMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the job is no longer dead-lettered', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    requeueMock.mockResolvedValue({ outcome: 'not_found' });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { jobId: '7' }));
    expect(response.status).toBe(404);
    expect(emitUsageEventMock).not.toHaveBeenCalled();
  });

  it('requeues, records one admin audit event, and redirects to the queue', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    requeueMock.mockResolvedValue({ outcome: 'requeued' });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { jobId: '7' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/queue');
    expect(requeueMock).toHaveBeenCalledWith(7);
    expect(emitUsageEventMock).toHaveBeenCalledWith('admin/esi-jobs/retry', {
      action: 'admin_esi_job_requeued',
      characterId: ADMIN.characterId,
      metadata: { jobId: 7, outcome: 'requeued' },
    });
  });

  it('treats a live replacement as an idempotent success', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    requeueMock.mockResolvedValue({ outcome: 'superseded' });
    const { POST } = await import('./route');
    const response = await POST(postForm(ROUTE, { jobId: '7' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin/queue');
    expect(emitUsageEventMock).toHaveBeenCalledOnce();
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = {
  user: { id: 'user-admin' },
  session: {},
  characterId: 90_000_001,
  isAdmin: true,
};

const getSessionMock = vi.fn();
const requeueMock = vi.fn();
const logUsageEventMock = vi.fn();
const sameOriginMock = vi.fn();

vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/data/esi-refresh-jobs/queries', () => ({
  requeueDeadLetteredJob: (id: number) => requeueMock(id),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/features/auth/same-origin', () => ({
  requireSameOrigin: (request: NextRequest) => sameOriginMock(request),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/esi-jobs/retry', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

async function importRoute() {
  return await import('./route');
}

describe('POST /api/admin/esi-jobs/retry', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    requeueMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    sameOriginMock.mockReset();
  });

  it('returns 403 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ jobId: '7' }));
    expect(response.status).toBe(403);
    expect(requeueMock).not.toHaveBeenCalled();
    expect(sameOriginMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not an admin', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ jobId: '7' }));
    expect(response.status).toBe(403);
    expect(requeueMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid job id', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const { POST } = await importRoute();
    const request = buildRequest({ jobId: 'not-a-number' });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(sameOriginMock).toHaveBeenCalledWith(request);
    expect(requeueMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the job is no longer dead-lettered', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    requeueMock.mockResolvedValue({ outcome: 'not_found' });
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ jobId: '7' }));
    expect(response.status).toBe(404);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('requeues, records one admin audit event, and redirects with the range', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    requeueMock.mockResolvedValue({ outcome: 'requeued' });
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ jobId: '7', range: '7d' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin?range=7d');
    expect(requeueMock).toHaveBeenCalledWith(7);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'admin_esi_job_requeued',
      characterId: ADMIN.characterId,
      metadata: { jobId: 7, outcome: 'requeued' },
    });
  });

  it('treats a live replacement as an idempotent success', async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    requeueMock.mockResolvedValue({ outcome: 'superseded' });
    const { POST } = await importRoute();
    const response = await POST(buildRequest({ jobId: '7', range: 'bad' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin?range=30d');
    expect(logUsageEventMock).toHaveBeenCalledOnce();
  });
});

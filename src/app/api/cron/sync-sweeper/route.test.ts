import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  logUsageEventMock: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => h.fetchMock(...args),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => h.logUsageEventMock(input),
}));

import { GET } from './route';

const SECRET = 'cron-secret';

function authedRequest(): Request {
  return new Request('http://localhost:3000/api/cron/sync-sweeper', {
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

function sweepCounts(counts: { dispatched: number; retired: number; deleted: number }): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(counts) } as unknown as Response;
}

beforeEach(() => {
  h.fetchMock.mockReset();
  h.logUsageEventMock.mockReset().mockResolvedValue(undefined);
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://happy-otter-123.convex.cloud');
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'svc-secret');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/cron/sync-sweeper', () => {
  it('rejects a request without the cron bearer token', async () => {
    const res = await GET(new Request('http://localhost:3000/api/cron/sync-sweeper'));
    expect(res.status).toBe(401);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('skips quietly on a Convex-less build', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'skipped',
      reason: 'convex_not_configured',
      dispatched: null,
      retired: null,
      deleted: null,
      durationMs: 0,
    });
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.logUsageEventMock).not.toHaveBeenCalled();
  });

  it('fails loudly on an unrecognized Convex URL shape', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.com');
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('unrecognized_convex_url');
    expect(h.fetchMock).not.toHaveBeenCalled();
    // A failure is noteworthy — the durable telemetry row is written.
    expect(h.logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sync_sweeper',
      metadata: expect.objectContaining({ status: 'failed', reason: 'unrecognized_convex_url' }),
    });
  });

  it('fails when the service secret is missing', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('service_secret_missing');
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.logUsageEventMock).toHaveBeenCalled();
  });

  it('fails with the HTTP status when the sweep POST is non-OK', async () => {
    h.fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('sweep_http_503');
    expect(h.logUsageEventMock).toHaveBeenCalled();
  });

  it('fails with the error name when the sweep POST throws', async () => {
    h.fetchMock.mockRejectedValue(new Error('boom'));
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('Error');
    expect(h.logUsageEventMock).toHaveBeenCalled();
  });

  it('sweeps against the .convex.site origin and reports the counts', async () => {
    h.fetchMock.mockResolvedValue(sweepCounts({ dispatched: 0, retired: 1, deleted: 2 }));
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.status).toBe('swept');
    expect(body).toMatchObject({ dispatched: 0, retired: 1, deleted: 2 });
    expect(h.fetchMock).toHaveBeenCalledWith('https://happy-otter-123.convex.site/sweep', {
      method: 'POST',
      headers: { authorization: 'Bearer svc-secret' },
    });
    // A healthy no-op sweep is NOT noteworthy — no durable telemetry row.
    expect(h.logUsageEventMock).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs loudly and writes telemetry when the sweep re-armed subjects', async () => {
    h.fetchMock.mockResolvedValue(sweepCounts({ dispatched: 2, retired: 0, deleted: 0 }));
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.status).toBe('swept');
    expect(body.dispatched).toBe(2);
    expect(console.error).toHaveBeenCalled();
    expect(h.logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sync_sweeper',
      metadata: expect.objectContaining({ status: 'swept', dispatched: 2 }),
    });
  });
});

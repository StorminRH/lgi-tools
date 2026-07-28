import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probeMock = vi.fn();
const recordChangedMock = vi.fn();
const logUsageEventMock = vi.fn();

let lockGot = true;
const releaseMock = vi.fn();
const reservedTag = vi.fn(() => Promise.resolve([{ got: lockGot }]));
Object.assign(reservedTag, { release: releaseMock });
const reserveMock = vi.fn(() => Promise.resolve(reservedTag));

vi.mock('@/composition/wh-statics-refresh', () => ({
  probeWhStaticsRefresh: (...args: unknown[]) => probeMock(...args),
  recordChangedWhStaticsFeed: (...args: unknown[]) =>
    recordChangedMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/db', () => ({
  directClient: { reserve: () => reserveMock() },
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: (client: unknown) => ({ client }),
}));

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

function authedRequest(): Request {
  return new Request(
    'http://localhost:3000/api/cron/refresh-wh-statics',
    { headers: { authorization: 'Bearer test-secret' } },
  );
}

async function importRoute() {
  return import('./route');
}

describe('GET /api/cron/refresh-wh-statics', () => {
  beforeEach(() => {
    vi.resetModules();
    lockGot = true;
    probeMock.mockReset();
    recordChangedMock.mockReset();
    logUsageEventMock.mockReset().mockResolvedValue(undefined);
    reserveMock.mockClear();
    reservedTag.mockClear();
    releaseMock.mockClear();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('finishes an unchanged conditional probe before reserving the lock', async () => {
    probeMock.mockResolvedValue({ status: 'unchanged' });
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({ status: 'unchanged' });
    expect(reserveMock).not.toHaveBeenCalled();
    expect(recordChangedMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_wh_statics',
      metadata: expect.objectContaining({ outcome: 'unchanged' }),
    });
  });

  it('records feed unavailability without touching the promoted copy', async () => {
    probeMock.mockResolvedValue({
      status: 'unavailable',
      reason: 'anoik.is request failed: offline',
    });
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({
      status: 'feed-unavailable',
      reason: 'anoik.is request failed: offline',
    });
    expect(reserveMock).not.toHaveBeenCalled();
    expect(recordChangedMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_wh_statics',
      metadata: expect.objectContaining({
        outcome: 'feed-unavailable',
        reason: 'anoik.is request failed: offline',
      }),
    });
  });

  it('stores a changed feed as pending under the shared lock', async () => {
    const feed = {
      status: 'changed',
      body: '{"version":11}',
      etag: '"feed-11"',
      lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
    } as const;
    const result = {
      status: 'snapshot-pending',
      snapshotId: 12,
      feedVersion: '11',
      systemCount: 2_604,
      assignmentCount: 3_772,
      totalDifferences: 0,
      disagreementCount: 0,
    } as const;
    probeMock.mockResolvedValue(feed);
    recordChangedMock.mockResolvedValue(result);
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

    expect(await response.json()).toEqual(result);
    expect(recordChangedMock).toHaveBeenCalledWith(
      { client: reservedTag },
      feed,
    );
    expect(releaseMock).toHaveBeenCalledOnce();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_wh_statics',
      metadata: expect.objectContaining({
        outcome: 'snapshot-pending',
        systemCount: 2_604,
        assignmentCount: 3_772,
        disagreementCount: 0,
      }),
    });
  });

  it('returns busy without writing when another refresh holds the lock', async () => {
    lockGot = false;
    probeMock.mockResolvedValue({
      status: 'changed',
      body: '{}',
      etag: '"changed"',
      lastModified: null,
    });
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({ status: 'busy' });
    expect(recordChangedMock).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await importRoute();
    const response = await GET(
      new Request('http://localhost:3000/api/cron/refresh-wh-statics'),
    );

    expect(response.status).toBe(401);
    expect(probeMock).not.toHaveBeenCalled();
  });
});

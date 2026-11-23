import { afterEach, expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { createReservedConnectionMock } from '@/db/__tests__/support/reserved-connection-mock';
import { cronRequest, TEST_CRON_SECRET } from '@/lib/__tests__/route-requests';

const probeMock = vi.fn();
const recordChangedMock = vi.fn();
const logUsageEventMock = vi.fn();
const directDatabaseMock = { handle: 'direct-database' };

let lockGot = true;
const { reserve: reserveMock } = createReservedConnectionMock(
  () => Promise.resolve([{ got: lockGot }]),
);

vi.mock('@/composition/wh-statics-refresh', () => ({
  probeWhStaticsRefresh: (...args: unknown[]) => probeMock(...args),
  recordChangedWhStaticsFeed: (...args: unknown[]) =>
    recordChangedMock(...args),
}));

vi.mock('@/data/telemetry/log', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/db', () => ({
  directClient: { reserve: () => reserveMock() },
}));

vi.mock('@/db/direct-database', () => ({
  directDatabase: () => directDatabaseMock,
}));

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

const ROUTE = '/api/cron/refresh-wh-statics';

const BASELINE = { etag: '"feed-10"', latestSnapshotId: 11 } as const;

function resetMocks(): void {
  lockGot = true;
  probeMock.mockReset();
  recordChangedMock.mockReset();
  logUsageEventMock.mockReset().mockResolvedValue(undefined);
  reserveMock.mockClear();
}

async function setup() {
  vi.resetModules();
  resetMocks();
  vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
  silenceConsolePrefixes('log', ['{"scope":"cron:']);
  const { GET } = await import('./route');
  return GET;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('finishes an unchanged or unavailable probe before the lock and records each outcome', async () => {
  const GET = await setup();
  const cases = [
    {
      feed: { status: 'unchanged' },
      body: { status: 'unchanged' },
      metadata: { outcome: 'unchanged' },
    },
    {
      feed: { status: 'unavailable', reason: 'anoik.is request failed: offline' },
      body: { status: 'feed-unavailable', reason: 'anoik.is request failed: offline' },
      metadata: { outcome: 'feed-unavailable', reason: 'anoik.is request failed: offline' },
    },
  ];

  for (const { feed, body, metadata } of cases) {
    resetMocks();
    probeMock.mockResolvedValue({ feed, baseline: BASELINE });

    const response = await GET(cronRequest(ROUTE));

    expect(await response.json()).toEqual(body);
    expect(probeMock).toHaveBeenCalledWith(directDatabaseMock);
    expect(reserveMock).not.toHaveBeenCalled();
    expect(recordChangedMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_wh_statics',
      metadata: expect.objectContaining(metadata),
    });
  }
});

test('records a changed feed under the lock, passing each recorded outcome through, and answers busy when the lock is held', async () => {
  const GET = await setup();
  const feed = {
    status: 'changed',
    body: '{"version":11}',
    etag: '"feed-11"',
    lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
  } as const;
  const pending = {
    status: 'snapshot-pending',
    snapshotId: 12,
    feedVersion: '11',
    systemCount: 2_604,
    assignmentCount: 3_772,
    totalDifferences: 0,
    disagreementCount: 0,
  } as const;
  const cases = [
    {
      result: pending,
      metadata: {
        outcome: 'snapshot-pending',
        systemCount: 2_604,
        assignmentCount: 3_772,
        disagreementCount: 0,
      },
    },
    { result: { status: 'unchanged' }, metadata: { outcome: 'unchanged' } },
    { result: { status: 'stale-observation' }, metadata: { outcome: 'stale-observation' } },
  ];

  for (const { result, metadata } of cases) {
    resetMocks();
    probeMock.mockResolvedValue({ feed, baseline: BASELINE });
    recordChangedMock.mockResolvedValue(result);

    const response = await GET(cronRequest(ROUTE));

    expect(await response.json()).toEqual(result);
    expect(recordChangedMock).toHaveBeenCalledWith(directDatabaseMock, feed, BASELINE);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_wh_statics',
      metadata: expect.objectContaining(metadata),
    });
  }

  resetMocks();
  lockGot = false;
  probeMock.mockResolvedValue({ feed, baseline: BASELINE });

  const busy = await GET(cronRequest(ROUTE));

  expect(await busy.json()).toEqual({ status: 'busy' });
  expect(recordChangedMock).not.toHaveBeenCalled();
});

test('rejects a request without the cron bearer token', async () => {
  const GET = await setup();
  const response = await GET(
    new Request('http://localhost:3000/api/cron/refresh-wh-statics'),
  );

  expect(response.status).toBe(401);
  expect(probeMock).not.toHaveBeenCalled();
});

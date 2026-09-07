import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  drain: vi.fn(),
  logUsageEvent: vi.fn(),
}));

let lockGot = true;
const reserved = Object.assign(
  vi.fn(() => Promise.resolve([{ got: lockGot }])),
  { release: vi.fn() },
);
const reserve = vi.fn(() => Promise.resolve(reserved));

vi.mock('@/db', () => ({
  directClient: { reserve: () => reserve() },
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => mocks.logUsageEvent(input),
}));
vi.mock('@/composition/sync/esi-refresh-worker', () => ({
  drainEsiRefreshJobs: mocks.drain,
}));
vi.mock('./public-budget-alert', () => ({
  maybeAlertPublicEsiBudgetExhaustion: mocks.alert,
}));
vi.mock('next/server', () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

import { GET, maxDuration } from './route';

const COUNTS = {
  claimed: 3,
  succeeded: 1,
  deferredForBudget: 1,
  failedRetryable: 1,
  failedPermanent: 0,
  deadLettered: 0,
  recovered: 2,
};

function authedRequest(): Request {
  return new Request(
    'http://localhost:3000/api/cron/drain-esi-refresh-jobs',
    {
      headers: { authorization: 'Bearer test-secret' },
    },
  );
}

describe('GET /api/cron/drain-esi-refresh-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T13:00:00.000Z'));
    vi.stubEnv('CRON_SECRET', 'test-secret');
    lockGot = true;
    mocks.alert.mockResolvedValue({ status: 'below-threshold', count: 0 });
    mocks.drain.mockResolvedValue(COUNTS);
    mocks.logUsageEvent.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rejects an unauthenticated request before reserving Neon', async () => {
    const response = await GET(
      new Request(
        'http://localhost:3000/api/cron/drain-esi-refresh-jobs',
      ),
    );

    expect(response.status).toBe(401);
    expect(reserve).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
  });

  it('always drains, including stale-job recovery', async () => {
    const response = await GET(authedRequest());

    expect(maxDuration).toBe(300);
    expect(await response.json()).toEqual({
      status: 'drained',
      ...COUNTS,
      durationMs: 0,
    });
    expect(reserve).toHaveBeenCalledOnce();
    expect(mocks.alert).toHaveBeenCalledOnce();
    expect(mocks.drain).toHaveBeenCalledOnce();
    expect(mocks.logUsageEvent).toHaveBeenCalledWith({
      action: 'cron_esi_refresh_jobs',
      metadata: {
        ...COUNTS,
        outcome: 'drained',
        durationMs: 0,
      },
    });
  });

  it('returns a durable-silent busy summary when the lock is held', async () => {
    lockGot = false;

    const response = await GET(authedRequest());

    expect(await response.json()).toMatchObject({
      status: 'skipped',
      reason: 'busy',
      claimed: 0,
      recovered: 0,
    });
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
    expect(mocks.logUsageEvent).not.toHaveBeenCalled();
  });
});

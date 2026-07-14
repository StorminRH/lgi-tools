import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  drain: vi.fn(),
  runCron: vi.fn(),
}));

vi.mock('@/db/cron-gate', () => ({ runCronJob: mocks.runCron }));
vi.mock('@/db/esi-refresh-worker', () => ({ drainEsiRefreshJobs: mocks.drain }));

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

describe('GET /api/cron/drain-esi-refresh-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.drain.mockResolvedValue(COUNTS);
    mocks.runCron.mockImplementation(
      ({ work }: { work: () => Promise<Response> }) => work(),
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows five minutes and returns the structured drain summary', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/cron/drain-esi-refresh-jobs'),
    );

    expect(maxDuration).toBe(300);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'drained',
      ...COUNTS,
      durationMs: expect.any(Number),
    });
    expect(mocks.drain).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"scope":"cron:esi-refresh-jobs"'),
    );
  });

  it('returns a zero-work summary when the advisory lock is busy', async () => {
    mocks.runCron.mockImplementation(
      ({ onBusy }: { onBusy: () => Response }) => onBusy(),
    );

    const response = await GET(
      new Request('http://localhost:3000/api/cron/drain-esi-refresh-jobs'),
    );

    expect(await response.json()).toMatchObject({
      status: 'skipped',
      reason: 'busy',
      claimed: 0,
      succeeded: 0,
      deferredForBudget: 0,
      failedRetryable: 0,
      failedPermanent: 0,
      deadLettered: 0,
      recovered: 0,
    });
    expect(mocks.drain).not.toHaveBeenCalled();
  });
});

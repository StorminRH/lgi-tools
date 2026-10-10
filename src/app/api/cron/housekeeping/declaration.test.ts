import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HousekeepingSummary } from '@/composition/pipelines/housekeeping';

const runHousekeeping = vi.hoisted(() => vi.fn());
vi.mock('@/composition/pipelines/housekeeping', () => ({ runHousekeeping }));

import { housekeepingDeclaration } from './declaration';

const context = { database: {} as never, record: async () => {} };

function summary(overrides: Partial<HousekeepingSummary> = {}): HousekeepingSummary {
  return {
    status: 'cleaned',
    deletes: [{ task: 'session', deleted: 0, finished: true, error: null }],
    retries: [{ task: 'requested_deletions', succeeded: 0, failed: 0, error: null }],
    ...overrides,
  };
}

beforeEach(() => {
  runHousekeeping.mockReset();
});

describe('housekeepingDeclaration', () => {
  it('reports a clean run with no work as an idle success', async () => {
    runHousekeeping.mockResolvedValue(summary());
    const outcome = await housekeepingDeclaration.work(context, undefined);
    expect(outcome).toMatchObject({ outcome: 'cleaned', workDone: false, failed: false });
    expect(outcome.telemetry).toEqual({ deletes: summary().deletes, retries: summary().retries });
  });

  it('counts deleted rows or finished retries as work done', async () => {
    runHousekeeping.mockResolvedValue(
      summary({ deletes: [{ task: 'session', deleted: 3, finished: true, error: null }] }),
    );
    expect((await housekeepingDeclaration.work(context, undefined)).workDone).toBe(true);

    runHousekeeping.mockResolvedValue(
      summary({ retries: [{ task: 'requested_deletions', succeeded: 1, failed: 0, error: null }] }),
    );
    expect((await housekeepingDeclaration.work(context, undefined)).workDone).toBe(true);
  });

  it('marks a partial run failed so the batch step reports it', async () => {
    runHousekeeping.mockResolvedValue(summary({ status: 'partial' }));
    await expect(housekeepingDeclaration.work(context, undefined)).resolves.toMatchObject({
      outcome: 'partial',
      failed: true,
    });
  });
});

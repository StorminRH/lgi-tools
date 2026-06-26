import { describe, expect, it } from 'vitest';
import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';
import { isNoteworthySweep } from './noteworthy';

// A healthy 15-min sweep is a no-op and must NOT write a durable row (that
// INSERT is the sole idle Neon compute-waker); only a re-arm (dispatched > 0)
// or a failure earns the row.
function summary(over: Partial<CronSyncSweeperResponse>): CronSyncSweeperResponse {
  return { status: 'swept', dispatched: 0, retired: 0, deleted: 0, durationMs: 1, ...over };
}

describe('isNoteworthySweep', () => {
  it('is false for a healthy no-op sweep (all counts zero)', () => {
    expect(isNoteworthySweep(summary({ status: 'swept', dispatched: 0 }))).toBe(false);
  });

  it('is false for a skipped sweep (Convex not configured)', () => {
    expect(
      isNoteworthySweep(
        summary({ status: 'skipped', dispatched: null, retired: null, deleted: null }),
      ),
    ).toBe(false);
  });

  it('is true when the watchdog re-armed an overdue subject', () => {
    expect(isNoteworthySweep(summary({ status: 'swept', dispatched: 3 }))).toBe(true);
  });

  it('is true when the sweep failed', () => {
    expect(
      isNoteworthySweep(
        summary({ status: 'failed', dispatched: null, retired: null, deleted: null }),
      ),
    ).toBe(true);
  });

  it('treats a null dispatched count as not noteworthy on a non-failure', () => {
    expect(isNoteworthySweep(summary({ status: 'swept', dispatched: null }))).toBe(false);
  });
});

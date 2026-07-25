// Off-database coverage for the indicator arithmetic.
//
// `sli-queries.db.test.ts` proves each indicator against real Postgres, but that
// suite skips wherever no database is reachable — including CI — so the decision
// logic here would otherwise be measured at zero coverage. These cases drive the
// branches that matter and that a seeded database exercises only incidentally:
// the empty window, a window made empty by exclusions, and a null or NaN
// percentile. Each asserts a decision, not a line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows.current),
      }),
    }),
  },
}));

import {
  getCriticalLatencyP95,
  getEsiSuccessRate,
  getMutationSuccessRate,
  getReadSuccessRate,
} from './sli-queries';

const RANGE = {
  from: new Date('2020-01-01T00:00:00Z'),
  to: new Date('2020-01-08T00:00:00Z'),
};

beforeEach(() => {
  rows.current = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('success-rate indicators', () => {
  it('returns null for a window with no recorded operations', async () => {
    rows.current = [{ total: 0, succeeded: 0, excluded: 0 }];
    await expect(getReadSuccessRate(RANGE)).resolves.toBeNull();
  });

  it('returns null when the query returns no row at all', async () => {
    rows.current = [];
    await expect(getReadSuccessRate(RANGE)).resolves.toBeNull();
  });

  it('computes the ratio over the recorded operations', async () => {
    rows.current = [{ total: 8, succeeded: 6, excluded: 0 }];
    await expect(getReadSuccessRate(RANGE)).resolves.toBeCloseTo(0.75, 5);
  });

  it('removes excluded outcomes from the mutation denominator', async () => {
    // 10 mutations, 4 of them validation failures: the rate is 5 of 6, not 5 of 10.
    rows.current = [{ total: 10, succeeded: 5, excluded: 4 }];
    await expect(getMutationSuccessRate(RANGE)).resolves.toBeCloseTo(5 / 6, 5);
  });

  it('returns null when every recorded mutation was excluded', async () => {
    // A window containing only rejected malformed requests has no service
    // signal in it, so it must read as “nothing recorded”, not as 0%.
    rows.current = [{ total: 4, succeeded: 0, excluded: 4 }];
    await expect(getMutationSuccessRate(RANGE)).resolves.toBeNull();
  });

  it('reports a genuine total failure as zero rather than null', async () => {
    rows.current = [{ total: 5, succeeded: 0, excluded: 0 }];
    await expect(getReadSuccessRate(RANGE)).resolves.toBe(0);
  });
});

describe('getCriticalLatencyP95', () => {
  it('returns null when the window recorded no durations', async () => {
    rows.current = [{ p95: null }];
    await expect(getCriticalLatencyP95(RANGE)).resolves.toBeNull();
  });

  it('returns null when the percentile is not a number', async () => {
    // percentile_cont over an empty set maps through as NaN rather than null.
    rows.current = [{ p95: Number.NaN }];
    await expect(getCriticalLatencyP95(RANGE)).resolves.toBeNull();
  });

  it('returns null when the query returns no row', async () => {
    rows.current = [];
    await expect(getCriticalLatencyP95(RANGE)).resolves.toBeNull();
  });

  it('rounds the percentile to whole milliseconds', async () => {
    rows.current = [{ p95: 412.6 }];
    await expect(getCriticalLatencyP95(RANGE)).resolves.toBe(413);
  });

  it('reports a genuine zero-millisecond percentile', async () => {
    rows.current = [{ p95: 0 }];
    await expect(getCriticalLatencyP95(RANGE)).resolves.toBe(0);
  });
});

describe('getEsiSuccessRate', () => {
  it('returns null when no operation recorded ESI time', async () => {
    rows.current = [{ total: 0, healthy: 0 }];
    await expect(getEsiSuccessRate(RANGE)).resolves.toBeNull();
  });

  it('returns null when the query returns no row', async () => {
    rows.current = [];
    await expect(getEsiSuccessRate(RANGE)).resolves.toBeNull();
  });

  it('reports the healthy share of ESI-dependent operations', async () => {
    rows.current = [{ total: 10, healthy: 7 }];
    await expect(getEsiSuccessRate(RANGE)).resolves.toBeCloseTo(0.7, 5);
  });

  it('reports a fully throttled window as zero, not as nothing recorded', async () => {
    rows.current = [{ total: 6, healthy: 0 }];
    await expect(getEsiSuccessRate(RANGE)).resolves.toBe(0);
  });
});

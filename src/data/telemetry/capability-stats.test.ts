import { describe, expect, it } from 'vitest';
import {
  capabilityFailureDetail,
  capabilitySuccessRate,
  esiAvailability,
  esiFailureGroups,
  roundedP95,
  slowestOperations,
  type CapabilityOutcomeStat,
  type OperationLatency,
} from './capability-stats';

const RANGE = {
  from: new Date('2026-07-01T00:00:00Z'),
  to: new Date('2026-07-08T00:00:00Z'),
};

function stat(overrides: Partial<CapabilityOutcomeStat>): CapabilityOutcomeStat {
  const failed = overrides.outcome !== undefined && overrides.outcome !== 'succeeded';
  return {
    operation: 'read-owned-assets',
    outcome: 'succeeded',
    esi: false,
    feature: failed ? 'planner' : null,
    code: failed ? 'unexpected' : null,
    errorClass: null,
    day: failed ? '2026-07-02' : null,
    count: 1,
    lastSeen: new Date('2026-07-02T12:00:00Z'),
    ...overrides,
  };
}

describe('capabilitySuccessRate', () => {
  it('returns null for a window with no recorded operations of the kind', () => {
    expect(capabilitySuccessRate([], 'read')).toBeNull();
    expect(capabilitySuccessRate([stat({ operation: 'create-saved-plan' })], 'read')).toBeNull();
    expect(capabilitySuccessRate([stat({ operation: null })], 'read')).toBeNull();
  });

  it('computes the ratio over the recorded operations of the kind', () => {
    const rows = [
      stat({ count: 6 }),
      stat({ outcome: 'unexpected', count: 1 }),
      stat({ outcome: 'unexpected', count: 1, day: '2026-07-03' }),
      stat({ operation: 'refresh-prices', outcome: 'unexpected', count: 50 }),
    ];
    expect(capabilitySuccessRate(rows, 'read')).toBeCloseTo(0.75, 5);
  });

  it('removes excluded outcomes from the mutation denominator only', () => {
    const rows = [
      stat({ operation: 'save-preferences', count: 5 }),
      stat({ operation: 'save-preferences', outcome: 'validation', count: 4 }),
      stat({ operation: 'save-preferences', outcome: 'conflict', count: 1 }),
      stat({ operation: 'read-owned-assets', outcome: 'validation', count: 1 }),
      stat({ operation: 'read-owned-assets', count: 1 }),
    ];
    expect(capabilitySuccessRate(rows, 'mutation')).toBeCloseTo(5 / 6, 5);
    expect(capabilitySuccessRate(rows, 'read')).toBeCloseTo(1 / 2, 5);
  });

  it('returns null when every recorded mutation was excluded', () => {
    expect(
      capabilitySuccessRate([stat({ operation: 'save-preferences', outcome: 'validation', count: 4 })], 'mutation'),
    ).toBeNull();
  });

  it('reports a genuine total failure as zero, counting unrecorded outcomes as not succeeded', () => {
    expect(capabilitySuccessRate([stat({ outcome: 'unexpected', count: 5 })], 'read')).toBe(0);
    expect(capabilitySuccessRate([stat({ count: 1 }), stat({ outcome: null, count: 1 })], 'read')).toBe(0.5);
  });
});

describe('esiAvailability', () => {
  it('returns a null rate when no operation recorded ESI time', () => {
    expect(esiAvailability([stat({ count: 3 })])).toEqual({ total: 0, healthy: 0, rate: null });
  });

  it('reports the healthy share of ESI-dependent operations of every kind', () => {
    const rows = [
      stat({ esi: true, count: 6 }),
      stat({ esi: true, operation: 'refresh-prices', outcome: 'unexpected', count: 1 }),
      stat({ esi: true, outcome: 'rate_limited', count: 2 }),
      stat({ esi: true, outcome: 'dependency_unavailable', count: 1 }),
      stat({ esi: false, outcome: 'rate_limited', count: 9 }),
    ];
    expect(esiAvailability(rows)).toEqual({ total: 10, healthy: 7, rate: 0.7 });
  });

  it('reports a fully throttled window as zero and an unrecorded outcome as unhealthy', () => {
    expect(esiAvailability([stat({ esi: true, outcome: 'rate_limited', count: 6 })]).rate).toBe(0);
    expect(esiAvailability([stat({ esi: true, outcome: null, count: 1 })])).toEqual({ total: 1, healthy: 0, rate: 0 });
  });
});

describe('capabilityFailureDetail', () => {
  it('merges failures across days and ESI use, most frequent then most recent first', () => {
    const rows = [
      stat({ outcome: 'unexpected', errorClass: '23502', count: 2, day: '2026-07-02' }),
      stat({ outcome: 'unexpected', errorClass: '23502', esi: true, count: 1, day: '2026-07-04', lastSeen: new Date('2026-07-04T09:00:00Z') }),
      stat({ outcome: 'not_found', code: 'missing', count: 3, lastSeen: new Date('2026-07-01T09:00:00Z') }),
      stat({ outcome: 'conflict', code: 'stale', count: 3, lastSeen: new Date('2026-07-03T09:00:00Z') }),
      stat({ outcome: 'succeeded', count: 40 }),
      stat({ outcome: null, count: 5 }),
    ];
    const detail = capabilityFailureDetail(rows, 'read', RANGE);
    expect(detail.groups.map((group) => [group.outcome, group.count, group.lastSeen.toISOString()])).toEqual([
      ['unexpected', 3, '2026-07-04T09:00:00.000Z'],
      ['conflict', 3, '2026-07-03T09:00:00.000Z'],
      ['not_found', 3, '2026-07-01T09:00:00.000Z'],
    ]);
    expect(detail.groups[0]).toMatchObject({ feature: 'planner', operation: 'read-owned-assets', code: 'unexpected', errorClass: '23502' });
    expect(detail.daily).toEqual([
      { day: '2026-07-02', failures: 8 },
      { day: '2026-07-04', failures: 1 },
    ]);
    expect(detail).not.toHaveProperty('validationRejected');
  });

  it('keeps the eight largest groups and falls back to the range end for an unknown last-seen time', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      stat({ outcome: 'unexpected', code: `code-${i}`, count: i + 1, lastSeen: null, day: null }),
    );
    const detail = capabilityFailureDetail(rows, 'read', RANGE);
    expect(detail.groups.map((group) => group.count)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
    expect(detail.groups.every((group) => group.lastSeen === RANGE.to)).toBe(true);
    expect(detail.daily).toEqual([]);
  });

  it('leaves invalid input out of mutation failures and counts it separately', () => {
    const rows = [
      stat({ operation: 'save-preferences', outcome: 'validation', count: 4 }),
      stat({ operation: 'save-preferences', outcome: 'conflict', count: 1 }),
      stat({ operation: 'read-owned-assets', outcome: 'validation', count: 7 }),
    ];
    const detail = capabilityFailureDetail(rows, 'mutation', RANGE);
    expect(detail.groups.map((group) => group.outcome)).toEqual(['conflict']);
    expect(detail.daily).toEqual([{ day: '2026-07-02', failures: 1 }]);
    expect(detail.validationRejected).toBe(4);
    expect(capabilityFailureDetail(rows, 'read', RANGE).groups.map((group) => group.outcome)).toEqual(['validation']);
  });
});

describe('esiFailureGroups', () => {
  it('groups ESI-dependent rate limits and outages without the error class', () => {
    const rows = [
      stat({ esi: true, outcome: 'rate_limited', code: 'esi_rate_limited', errorClass: 'A', count: 1 }),
      stat({ esi: true, outcome: 'rate_limited', code: 'esi_rate_limited', errorClass: 'B', count: 2, lastSeen: new Date('2026-07-05T00:00:00Z') }),
      stat({ esi: true, operation: 'refresh-prices', feature: 'cron', outcome: 'dependency_unavailable', code: 'esi_down', count: 1 }),
      stat({ esi: true, outcome: 'unexpected', count: 9 }),
      stat({ esi: false, outcome: 'rate_limited', count: 9 }),
    ];
    expect(esiFailureGroups(rows, RANGE)).toEqual([
      {
        feature: 'planner',
        operation: 'read-owned-assets',
        outcome: 'rate_limited',
        code: 'esi_rate_limited',
        errorClass: null,
        count: 3,
        lastSeen: new Date('2026-07-05T00:00:00Z'),
      },
      {
        feature: 'cron',
        operation: 'refresh-prices',
        outcome: 'dependency_unavailable',
        code: 'esi_down',
        errorClass: null,
        count: 1,
        lastSeen: new Date('2026-07-02T12:00:00Z'),
      },
    ]);
  });
});

describe('roundedP95', () => {
  it('returns null when the window recorded no durations', () => {
    expect(roundedP95(null)).toBeNull();
    expect(roundedP95(undefined)).toBeNull();
    expect(roundedP95(Number.NaN)).toBeNull();
  });

  it('rounds the percentile to whole milliseconds and keeps a genuine zero', () => {
    expect(roundedP95(412.6)).toBe(413);
    expect(roundedP95(0)).toBe(0);
  });
});

describe('slowestOperations', () => {
  function latency(operation: string, p95: number | null, dependencyMs: OperationLatency['dependencyMs']): OperationLatency {
    return { feature: 'planner', operation, p95, count: 2, dependencyMs };
  }
  const none = { neon: null, esi: null, redis: null };

  it('keeps the five slowest by p95, an untimed operation first as Postgres sorts it', () => {
    const rows = [
      latency('a', 100, none),
      latency('b', 900.4, none),
      latency('c', null, none),
      latency('d', 300, none),
      latency('e', 50, none),
      latency('f', 700, none),
      latency('g', 10, none),
    ];
    expect(slowestOperations(rows).map((row) => [row.operation, row.p95Ms])).toEqual([
      ['c', 0],
      ['b', 900],
      ['f', 700],
      ['d', 300],
      ['a', 100],
    ]);
  });

  it('names the dependency with the most average time per run', () => {
    const [row] = slowestOperations([latency('a', 100, { neon: 20, esi: 150, redis: 5 })]);
    expect(row).toEqual({ feature: 'planner', operation: 'a', p95Ms: 100, count: 2, slowestDependency: 'esi' });
    expect(slowestOperations([latency('a', 1, { neon: 0, esi: Number.NaN, redis: null })])[0]?.slowestDependency).toBeNull();
    expect(slowestOperations([latency('a', 1, { neon: 9, esi: 9, redis: 3 })])[0]?.slowestDependency).toBe('neon');
  });
});

import { expect, test } from 'vitest';
import {
  capabilityFailureDetail,
  capabilitySuccessRate,
  esiAvailability,
  esiClientErrors,
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

test('capabilitySuccessRate counts a kind’s own operations, leaves excluded outcomes out of the mutation denominator only, and is null with nothing counted', () => {
  expect(capabilitySuccessRate([], 'read')).toBeNull();
  expect(capabilitySuccessRate([stat({ operation: 'create-saved-plan' })], 'read')).toBeNull();
  expect(capabilitySuccessRate([stat({ operation: null })], 'read')).toBeNull();

  const reads = [
    stat({ count: 6 }),
    stat({ outcome: 'unexpected', count: 1 }),
    stat({ outcome: 'unexpected', count: 1, day: '2026-07-03' }),
    stat({ operation: 'refresh-prices', outcome: 'unexpected', count: 50 }),
  ];
  expect(capabilitySuccessRate(reads, 'read')).toBeCloseTo(0.75, 5);

  const mixed = [
    stat({ operation: 'save-preferences', count: 5 }),
    stat({ operation: 'save-preferences', outcome: 'validation', count: 4 }),
    stat({ operation: 'save-preferences', outcome: 'conflict', count: 1 }),
    stat({ operation: 'read-owned-assets', outcome: 'validation', count: 1 }),
    stat({ operation: 'read-owned-assets', count: 1 }),
  ];
  expect(capabilitySuccessRate(mixed, 'mutation')).toBeCloseTo(5 / 6, 5);
  expect(capabilitySuccessRate(mixed, 'read')).toBeCloseTo(1 / 2, 5);
  expect(
    capabilitySuccessRate([stat({ operation: 'save-preferences', outcome: 'validation', count: 4 })], 'mutation'),
  ).toBeNull();

  // A genuine total failure is zero, and an unrecorded outcome counts as not succeeded.
  expect(capabilitySuccessRate([stat({ outcome: 'unexpected', count: 5 })], 'read')).toBe(0);
  expect(capabilitySuccessRate([stat({ count: 1 }), stat({ outcome: null, count: 1 })], 'read')).toBe(0.5);
});

test('esiAvailability counts only ESI-timed rows of every kind, treats limits, outages and unrecorded outcomes as unhealthy, and is null with none', () => {
  expect(esiAvailability([stat({ count: 3 })])).toEqual({ total: 0, healthy: 0, rate: null });

  const rows = [
    stat({ esi: true, count: 6 }),
    stat({ esi: true, operation: 'refresh-prices', outcome: 'unexpected', count: 1 }),
    stat({ esi: true, outcome: 'rate_limited', count: 2 }),
    stat({ esi: true, outcome: 'dependency_unavailable', count: 1 }),
    stat({ esi: false, outcome: 'rate_limited', count: 9 }),
  ];
  expect(esiAvailability(rows)).toEqual({ total: 10, healthy: 7, rate: 0.7 });

  expect(esiAvailability([stat({ esi: true, outcome: 'rate_limited', count: 6 })]).rate).toBe(0);
  expect(esiAvailability([stat({ esi: true, outcome: null, count: 1 })])).toEqual({ total: 1, healthy: 0, rate: 0 });
});

test('capabilityFailureDetail groups, ranks and caps failures per kind, with validation counted separately for mutations only', () => {
  const reads = [
    stat({ outcome: 'unexpected', errorClass: '23502', count: 2, day: '2026-07-02' }),
    stat({ outcome: 'unexpected', errorClass: '23502', esi: true, count: 1, day: '2026-07-04', lastSeen: new Date('2026-07-04T09:00:00Z') }),
    stat({ outcome: 'not_found', code: 'missing', count: 3, lastSeen: new Date('2026-07-01T09:00:00Z') }),
    stat({ outcome: 'conflict', code: 'stale', count: 3, lastSeen: new Date('2026-07-03T09:00:00Z') }),
    stat({ outcome: 'succeeded', count: 40 }),
    stat({ outcome: null, count: 5 }),
  ];
  // Failures merge across days and ESI use, most frequent then most recent first.
  const detail = capabilityFailureDetail(reads, 'read', RANGE);
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

  // The eight largest groups stay, and an unknown last-seen time falls back to the range end.
  const many = Array.from({ length: 10 }, (_, i) =>
    stat({ outcome: 'unexpected', code: `code-${i}`, count: i + 1, lastSeen: null, day: null }),
  );
  const capped = capabilityFailureDetail(many, 'read', RANGE);
  expect(capped.groups.map((group) => group.count)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  expect(capped.groups.every((group) => group.lastSeen === RANGE.to)).toBe(true);
  expect(capped.daily).toEqual([]);

  const mutations = [
    stat({ operation: 'save-preferences', outcome: 'validation', count: 4 }),
    stat({ operation: 'save-preferences', outcome: 'conflict', count: 1 }),
    stat({ operation: 'read-owned-assets', outcome: 'validation', count: 7 }),
  ];
  const mutation = capabilityFailureDetail(mutations, 'mutation', RANGE);
  expect(mutation.groups.map((group) => group.outcome)).toEqual(['conflict']);
  expect(mutation.daily).toEqual([{ day: '2026-07-02', failures: 1 }]);
  expect(mutation.validationRejected).toBe(4);
  expect(capabilityFailureDetail(mutations, 'read', RANGE).groups.map((group) => group.outcome)).toEqual(['validation']);
});

test('esiFailureGroups groups ESI-dependent rate limits and outages without the error class', () => {
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

test('roundedP95 rounds to whole milliseconds, keeps a genuine zero, and is null for a window that timed nothing', () => {
  expect(roundedP95(null)).toBeNull();
  expect(roundedP95(undefined)).toBeNull();
  expect(roundedP95(Number.NaN)).toBeNull();
  expect(roundedP95(412.6)).toBe(413);
  expect(roundedP95(0)).toBe(0);
});

test('slowestOperations keeps the five slowest by p95, untimed first as Postgres sorts it, and names the dominant dependency with clamped shares', () => {
  const none: OperationLatency['dependencyMs'] = {
    neon: null, esi: null, redis: null, convex: null, sso: null, fuzzwork: null,
  };
  function latency(
    operation: string,
    p95: number | null,
    dependencyMs: Partial<OperationLatency['dependencyMs']>,
    extra: Partial<Pick<OperationLatency, 'durationMs' | 'untimedShare'>> = {},
  ): OperationLatency {
    return {
      feature: 'planner',
      operation,
      p95,
      count: 2,
      durationMs: 200,
      untimedShare: null,
      ...extra,
      dependencyMs: { ...none, ...dependencyMs },
    };
  }

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

  // The dependency with the most average time per run is named with its share of the run.
  const [row] = slowestOperations([
    latency('a', 100, { neon: 20, esi: 150, redis: 5 }, { untimedShare: 0.1 }),
  ]);
  expect(row).toEqual({
    feature: 'planner',
    operation: 'a',
    p95Ms: 100,
    count: 2,
    slowestDependency: 'esi',
    slowestShare: 0.75,
    untimedShare: 0.1,
  });
  expect(slowestOperations([latency('a', 1, { neon: 0, esi: Number.NaN, redis: null })])[0]?.slowestDependency).toBeNull();
  expect(slowestOperations([latency('a', 1, { neon: 9, esi: 9, redis: 3 })])[0]?.slowestDependency).toBe('neon');

  // Shares clamp to 0-1, and are unknown without a duration or recorded wall time.
  const [over] = slowestOperations([latency('a', 1, { esi: 500 }, { untimedShare: -0.2 })]);
  expect(over).toMatchObject({ slowestShare: 1, untimedShare: 0 });
  const [unknown] = slowestOperations([latency('a', 1, { esi: 5 }, { durationMs: null, untimedShare: Number.NaN })]);
  expect(unknown).toMatchObject({ slowestShare: null, untimedShare: null });
});

test('esiClientErrors totals every operation, lists only those with a 4xx most first, and has no rate before any call', () => {
  const group = (operation: string, errors: number, calls: number) => ({
    feature: 'planner', operation, errors, calls, lastSeen: new Date('2026-09-20T00:00:00Z'),
  });
  const summary = esiClientErrors([group('a', 0, 100), group('b', 2, 50), group('c', 5, 50)]);
  expect(summary).toMatchObject({ errors: 7, calls: 200, rate: 0.035 });
  expect(summary.groups.map((row) => row.operation)).toEqual(['c', 'b']);
  expect(esiClientErrors([])).toEqual({ errors: 0, calls: 0, rate: null, groups: [] });
});

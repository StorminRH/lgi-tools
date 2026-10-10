import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { DEPENDENCY_KINDS, type DependencyKind } from '@/lib/dependency-timing';
import { operationsOfKind, USER_FACING_CAPABILITY_KINDS } from './capability';
import {
  capabilityFailureDetail,
  capabilitySuccessRate,
  esiAvailability,
  esiFailureGroups,
} from './capability-stats';
import { usageLogs } from './schema';
import { getCapabilityLatency, getCapabilityOutcomeStats, getEsiClientErrors } from './sli-breakdown';
import { ESI_FAILURE_OUTCOMES } from './sql';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_sli_breakdown',
  tables: ['usage_logs', 'characters'],
  steerDbProxy: true,
});

const RANGE = {
  from: new Date('2020-03-01T00:00:00Z'),
  to: new Date('2020-03-08T00:00:00Z'),
};
const DAY_ONE = new Date('2020-03-02T12:00:00Z');
const DAY_TWO = new Date('2020-03-04T09:00:00Z');

function capabilityRow(timestamp: Date, metadata: Record<string, unknown>) {
  return {
    timestamp,
    action: 'capability_outcome',
    metadata: {
      feature: 'account',
      code: 'ok',
      durationMs: 10,
      dependencies: {},
      retry: null,
      correlationId: 'seeded',
      appVersion: 'test',
      ...metadata,
    },
  };
}

describe.skipIf(!harness.reachable)('service level breakdown queries', () => {
  beforeAll(async () => {
    await harness.db.insert(usageLogs).values([
      capabilityRow(DAY_ONE, { operation: 'save-preferences', outcome: 'succeeded' }),
      capabilityRow(DAY_ONE, { operation: 'save-preferences', outcome: 'unexpected', code: 'unexpected', errorClass: '23502' }),
      capabilityRow(DAY_TWO, { operation: 'save-preferences', outcome: 'unexpected', code: 'unexpected', errorClass: '23502' }),
      capabilityRow(DAY_TWO, { operation: 'save-preferences', outcome: 'validation', code: 'invalid_value' }),
      capabilityRow(DAY_TWO, {
        feature: 'maps',
        operation: 'create-map',
        outcome: 'dependency_unavailable',
        code: 'projection_unavailable',
        durationMs: 900,
        dependencies: { neon: { ms: 30, calls: 2 } },
      }),
      capabilityRow(DAY_ONE, {
        feature: 'planner',
        operation: 'read-owned-assets',
        outcome: 'rate_limited',
        code: 'esi_rate_limited',
        durationMs: 2_000,
        dependencies: { esi: { ms: 1_800, calls: 3 }, neon: { ms: 20, calls: 1 } },
      }),
    ]);
  });

  it('groups failed saves by operation, result and error class, leaving validation out', async () => {
    const detail = capabilityFailureDetail(await getCapabilityOutcomeStats(RANGE), 'mutation', RANGE);
    expect(detail.groups).toEqual([
      {
        feature: 'account',
        operation: 'save-preferences',
        outcome: 'unexpected',
        code: 'unexpected',
        errorClass: '23502',
        count: 2,
        lastSeen: DAY_TWO,
      },
      {
        feature: 'maps',
        operation: 'create-map',
        outcome: 'dependency_unavailable',
        code: 'projection_unavailable',
        errorClass: null,
        count: 1,
        lastSeen: DAY_TWO,
      },
    ]);
    expect(detail.validationRejected).toBe(1);
  });

  it('counts failures per UTC day', async () => {
    const detail = capabilityFailureDetail(await getCapabilityOutcomeStats(RANGE), 'mutation', RANGE);
    expect(detail.daily).toEqual([
      { day: '2020-03-02', failures: 1 },
      { day: '2020-03-04', failures: 2 },
    ]);
  });

  it('collapses successes to one group per operation', async () => {
    const stats = await getCapabilityOutcomeStats(RANGE);
    expect(stats.find((row) => row.outcome === 'succeeded')).toEqual({
      operation: 'save-preferences',
      outcome: 'succeeded',
      esi: false,
      feature: null,
      code: null,
      errorClass: null,
      day: null,
      count: 1,
      lastSeen: DAY_ONE,
    });
  });

  it('ranks the slowest operations and names where their time went', async () => {
    const { slowest } = await getCapabilityLatency(RANGE);
    expect(slowest[0]).toEqual({
      feature: 'planner',
      operation: 'read-owned-assets',
      p95Ms: 2_000,
      count: 1,
      slowestDependency: 'esi',
      slowestShare: 0.9,
      untimedShare: null,
    });
    expect(slowest.find((row) => row.operation === 'save-preferences')?.slowestDependency).toBeNull();
  });

  it('compares dependency time across all runs, including runs without that dependency', async () => {
    const timestamp = new Date('2030-03-02T12:00:00Z');
    const range = {
      from: new Date('2030-03-01T00:00:00Z'),
      to: new Date('2030-03-08T00:00:00Z'),
    };
    await harness.db.insert(usageLogs).values([
      capabilityRow(timestamp, {
        feature: 'planner', operation: 'read-owned-assets', outcome: 'succeeded', durationMs: 300,
        dependencies: { neon: { ms: 100, calls: 1 }, esi: { ms: 150, calls: 1 } },
      }),
      capabilityRow(timestamp, {
        feature: 'planner', operation: 'read-owned-assets', outcome: 'succeeded', durationMs: 300,
        dependencies: { neon: { ms: 100, calls: 1 } },
      }),
    ]);

    await expect(getCapabilityLatency(range)).resolves.toEqual({
      p95: 300,
      slowest: [
        {
          feature: 'planner', operation: 'read-owned-assets', p95Ms: 300, count: 2,
          slowestDependency: 'neon', slowestShare: expect.closeTo(1 / 3, 6), untimedShare: null,
        },
      ],
    });
  });

  it('prefers wall time over summed time and reports the share no dependency covered', async () => {
    const timestamp = new Date('2032-03-02T12:00:00Z');
    const range = {
      from: new Date('2032-03-01T00:00:00Z'),
      to: new Date('2032-03-08T00:00:00Z'),
    };
    await harness.db.insert(usageLogs).values([
      // Ten parallel 100 ms ESI calls: 1,000 ms summed, 100 ms of wall time.
      capabilityRow(timestamp, {
        feature: 'market', operation: 'refresh-market-prices', outcome: 'succeeded', durationMs: 400,
        dependencies: {
          esi: { ms: 1_000, calls: 10, wallMs: 100 },
          redis: { ms: 300, calls: 20, wallMs: 200 },
        },
        dependencyWallMs: 300,
      }),
      capabilityRow(timestamp, {
        feature: 'market', operation: 'refresh-market-prices', outcome: 'succeeded', durationMs: 400,
        dependencies: { redis: { ms: 200, calls: 5, wallMs: 200 } },
        dependencyWallMs: 200,
      }),
    ]);

    await expect(getCapabilityLatency(range)).resolves.toEqual({
      p95: 400,
      slowest: [
        {
          feature: 'market', operation: 'refresh-market-prices', p95Ms: 400, count: 2,
          slowestDependency: 'redis', slowestShare: 0.5, untimedShare: 0.375,
        },
      ],
    });
  });

  it('takes shares from runs that recorded wall time when an operation has both kinds', async () => {
    const timestamp = new Date('2034-03-02T12:00:00Z');
    const range = {
      from: new Date('2034-03-01T00:00:00Z'),
      to: new Date('2034-03-08T00:00:00Z'),
    };
    await harness.db.insert(usageLogs).values([
      // An older run: ten parallel ESI calls summed to more than the run took.
      capabilityRow(timestamp, {
        feature: 'market', operation: 'refresh-market-prices', outcome: 'succeeded', durationMs: 400,
        dependencies: { esi: { ms: 1_000, calls: 10 } },
      }),
      capabilityRow(timestamp, {
        feature: 'market', operation: 'refresh-market-prices', outcome: 'succeeded', durationMs: 400,
        dependencies: { esi: { ms: 1_000, calls: 10, wallMs: 100 }, redis: { ms: 100, calls: 4, wallMs: 100 } },
        dependencyWallMs: 200,
      }),
    ]);

    await expect(getCapabilityLatency(range)).resolves.toEqual({
      p95: 400,
      slowest: [
        {
          feature: 'market', operation: 'refresh-market-prices', p95Ms: 400, count: 2,
          slowestDependency: 'esi', slowestShare: 0.25, untimedShare: 0.5,
        },
      ],
    });
  });

  it('sums ESI calls and 4xx answers per operation, leaving out older records that could not record a 4xx', async () => {
    const timestamp = new Date('2033-03-02T12:00:00Z');
    const later = new Date('2033-03-03T12:00:00Z');
    const latest = new Date('2033-03-04T12:00:00Z');
    const range = {
      from: new Date('2033-03-01T00:00:00Z'),
      to: new Date('2033-03-08T00:00:00Z'),
    };
    await harness.db.insert(usageLogs).values([
      capabilityRow(timestamp, {
        feature: 'maps', operation: 'search-characters', outcome: 'succeeded',
        dependencies: { esi: { ms: 90, calls: 21, wallMs: 60, status4xx: 2 } },
      }),
      // A later clean run counts its calls but does not move "last seen".
      capabilityRow(later, {
        feature: 'maps', operation: 'search-characters', outcome: 'succeeded',
        dependencies: { esi: { ms: 20, calls: 5, wallMs: 20 } },
      }),
      // Written before statuses were captured: no wall time, so not counted at all.
      capabilityRow(latest, {
        feature: 'maps', operation: 'search-characters', outcome: 'succeeded',
        dependencies: { esi: { ms: 30, calls: 4 } },
      }),
      capabilityRow(timestamp, {
        feature: 'account', operation: 'save-preferences', outcome: 'succeeded',
        dependencies: { neon: { ms: 5, calls: 1 } },
      }),
    ]);

    await expect(getEsiClientErrors(range)).resolves.toEqual([
      { feature: 'maps', operation: 'search-characters', errors: 2, calls: 26, lastSeen: timestamp },
    ]);
  });

  it('lists ESI-dependent operations CCP limited or failed', async () => {
    expect(esiFailureGroups(await getCapabilityOutcomeStats(RANGE), RANGE)).toEqual([
      {
        feature: 'planner',
        operation: 'read-owned-assets',
        outcome: 'rate_limited',
        code: 'esi_rate_limited',
        errorClass: null,
        count: 1,
        lastSeen: DAY_ONE,
      },
    ]);
  });
});

/** Average over runs that recorded wall time, falling back to every run when none did. */
const recordedFirst = (value: string) =>
  `coalesce(avg(${value}) filter (where metadata ? 'dependencyWallMs'), avg(${value}))`;

// The per-figure queries these reads replaced, kept as the reference the
// single grouped reads must agree with.
const ORACLE = {
  where: `"timestamp" >= $1::timestamptz and "timestamp" < $2::timestamptz and action = 'capability_outcome'`,
  successRatio: `
    select count(*)::int as total,
      count(*) filter (where metadata ->> 'outcome' = 'succeeded')::int as succeeded,
      count(*) filter (where metadata ->> 'outcome' = any($4::text[]))::int as excluded
    from usage_logs where {where} and metadata ->> 'operation' = any($3::text[])`,
  esi: `
    select count(*)::int as total,
      count(*) filter (where not (metadata ->> 'outcome' = any($3::text[])))::int as healthy
    from usage_logs where {where} and metadata -> 'dependencies' ? 'esi'`,
  failures: `
    select metadata ->> 'feature' as feature, metadata ->> 'operation' as operation,
      metadata ->> 'outcome' as outcome, metadata ->> 'code' as code,
      metadata ->> 'errorClass' as "errorClass", count(*)::int as count, max("timestamp") as "lastSeen"
    from usage_logs
    where {where} and metadata ->> 'operation' = any($3::text[])
      and not (metadata ->> 'outcome' = any($4::text[]))
    group by 1, 2, 3, 4, 5 order by count(*) desc, max("timestamp") desc limit 8`,
  daily: `
    select to_char(date_trunc('day', "timestamp"), 'YYYY-MM-DD') as day,
      count(*) filter (where not (metadata ->> 'outcome' = any($4::text[])))::int as failures
    from usage_logs where {where} and metadata ->> 'operation' = any($3::text[])
    group by 1 order by 1`,
  validation: `
    select count(*)::int as count from usage_logs
    where {where} and metadata ->> 'operation' = any($3::text[]) and metadata ->> 'outcome' = 'validation'`,
  esiFailures: `
    select metadata ->> 'feature' as feature, metadata ->> 'operation' as operation,
      metadata ->> 'outcome' as outcome, metadata ->> 'code' as code,
      null as "errorClass", count(*)::int as count, max("timestamp") as "lastSeen"
    from usage_logs
    where {where} and metadata -> 'dependencies' ? 'esi' and metadata ->> 'outcome' = any($3::text[])
    group by 1, 2, 3, 4 order by count(*) desc, max("timestamp") desc limit 8`,
  p95: `
    select percentile_cont(0.95) within group (order by nullif(metadata ->> 'durationMs', 'null')::double precision) as p95
    from usage_logs where {where} and metadata ->> 'operation' = any($3::text[])`,
  slowest: `
    select metadata ->> 'feature' as feature, metadata ->> 'operation' as operation,
      percentile_cont(0.95) within group (order by nullif(metadata ->> 'durationMs', 'null')::double precision) as p95,
      count(*)::int as count,
      ${recordedFirst(`nullif(metadata ->> 'durationMs', 'null')::double precision`)} as duration,
      avg(nullif(metadata ->> 'durationMs', 'null')::double precision - nullif(metadata ->> 'dependencyWallMs', 'null')::double precision)
        filter (where metadata ? 'dependencyWallMs')
        / nullif(avg(nullif(metadata ->> 'durationMs', 'null')::double precision) filter (where metadata ? 'dependencyWallMs'), 0) as untimed,
      ${DEPENDENCY_KINDS.map((kind) => `${recordedFirst(`coalesce(
        nullif(metadata -> 'dependencies' -> '${kind}' ->> 'wallMs', 'null')::double precision,
        nullif(metadata -> 'dependencies' -> '${kind}' ->> 'ms', 'null')::double precision, 0)`)} as ${kind}`).join(',\n      ')}
    from usage_logs where {where} and metadata ->> 'operation' = any($3::text[])
    group by 1, 2 order by 3 desc limit 5`,
};

const OPERATIONS = [
  ['planner', 'read-owned-assets'],
  ['planner', 'resolve-entity-names'],
  ['structures', 'search-structures'],
  ['account', 'save-preferences'],
  ['maps', 'create-map'],
  ['planner', 'create-saved-plan'],
  ['cron', 'refresh-prices'],
  ['sync', 'process-esi-refresh-job'],
  ['planner', 'not-in-catalogue'],
] as const;
const OUTCOMES = ['succeeded', 'succeeded', 'succeeded', 'validation', 'unexpected', 'conflict', 'rate_limited', 'dependency_unavailable', null, 'not_found', 'succeeded'];
const DEPENDENCIES = [
  {},
  { esi: { ms: 40, calls: 1 } },
  { neon: { ms: 12, calls: 2 } },
  { esi: { ms: 5, calls: 1 }, neon: { ms: 30, calls: 1 }, redis: { ms: 2, calls: 1 } },
  null,
  { redis: { ms: 7, calls: 1 } },
  { esi: { ms: 900, calls: 3 } },
  { esi: { ms: 400, calls: 4, wallMs: 120 }, convex: { ms: 60, calls: 1, wallMs: 60 } },
  { sso: { ms: 80, calls: 1, wallMs: 80 }, neon: { ms: 25, calls: 2, wallMs: 20 } },
];
const CODES = ['ok', 'esi_rate_limited', 'template_limit', 'projection_unavailable'];
const ERROR_CLASSES = [undefined, '23502', 'ECONNRESET'];

/** Deterministic, varied capability rows: every timestamp is distinct so rankings never tie. */
function variedRows(range: { from: Date }, total: number) {
  return Array.from({ length: total }, (_, i) => {
    const [feature, operation] = OPERATIONS[i % OPERATIONS.length]!;
    const outcome = OUTCOMES[(i * 7) % OUTCOMES.length]!;
    const dependencies = DEPENDENCIES[(i * 5) % DEPENDENCIES.length];
    const errorClass = ERROR_CLASSES[(i * 3) % ERROR_CLASSES.length];
    const metadata: Record<string, unknown> = {
      feature,
      operation,
      code: CODES[(i * 11) % CODES.length],
      durationMs: i % 13 === 0 ? null : 50 + ((i * 37) % 997) + i / 1000,
      correlationId: `oracle-${i}`,
      ...(outcome === null ? {} : { outcome }),
      ...(dependencies === null ? {} : { dependencies }),
      ...(i % 4 === 0 ? { dependencyWallMs: 20 + (i % 50) } : {}),
      ...(errorClass === undefined ? {} : { errorClass }),
    };
    return {
      action: 'capability_outcome',
      timestamp: new Date(range.from.getTime() + i * 3_517_000),
      metadata,
    };
  });
}

describe.skipIf(!harness.reachable)('capability reads agree with the per-figure queries they replaced', () => {
  const range = {
    from: new Date('2031-01-01T06:30:00Z'),
    to: new Date('2031-01-08T06:30:00Z'),
  };
  const read = operationsOfKind('read');
  const mutation = operationsOfKind('mutation');
  const userFacing = operationsOfKind(...USER_FACING_CAPABILITY_KINDS);

  function oracle<T>(query: string, ...params: unknown[]): Promise<T[]> {
    const text = query.replaceAll('{where}', ORACLE.where);
    return harness.sql.unsafe(text, [range.from.toISOString(), range.to.toISOString(), ...params] as never[]) as unknown as Promise<T[]>;
  }

  // The harness client hands timestamps back as text.
  const withDates = (rows: { lastSeen: string }[]) =>
    rows.map((row) => ({ ...row, lastSeen: new Date(row.lastSeen) }));

  beforeAll(async () => {
    await harness.db.insert(usageLogs).values(variedRows(range, 160));
    await harness.db.insert(usageLogs).values([
      { action: 'page_view', timestamp: range.from, metadata: { outcome: 'unexpected', operation: 'save-preferences' } },
      capabilityRow(range.to, { operation: 'save-preferences', outcome: 'unexpected' }),
    ]);
  });

  it('matches the success rates and ESI availability', async () => {
    const stats = await getCapabilityOutcomeStats(range);
    const ratio = ([row]: { total: number; succeeded: number; excluded: number }[]) =>
      row!.total - row!.excluded > 0 ? row!.succeeded / (row!.total - row!.excluded) : null;

    const readRate = capabilitySuccessRate(stats, 'read');
    const mutationRate = capabilitySuccessRate(stats, 'mutation');
    expect(readRate).toBe(ratio(await oracle(ORACLE.successRatio, read, [])));
    expect(mutationRate).toBe(ratio(await oracle(ORACLE.successRatio, mutation, ['validation'])));
    for (const rate of [readRate, mutationRate]) {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(1);
    }
    const [esi] = await oracle<{ total: number; healthy: number }>(ORACLE.esi, [...ESI_FAILURE_OUTCOMES]);
    expect(esiAvailability(stats)).toEqual({ ...esi, rate: esi!.healthy / esi!.total });
  });

  it('matches the failure groups, daily failures and validation count per kind', async () => {
    const stats = await getCapabilityOutcomeStats(range);
    for (const [kind, operations, excluded] of [
      ['read', read, []],
      ['mutation', mutation, ['validation']],
    ] as const) {
      const notIn = ['succeeded', ...excluded];
      const detail = capabilityFailureDetail(stats, kind, range);
      expect(detail.groups.length).toBeGreaterThan(1);
      expect(detail.groups).toEqual(withDates(await oracle(ORACLE.failures, operations, notIn)));
      const daily = await oracle<{ day: string; failures: number }>(ORACLE.daily, operations, notIn);
      expect(detail.daily).toEqual(daily.filter((day) => day.failures > 0));
      if (kind === 'mutation') {
        const [validation] = await oracle<{ count: number }>(ORACLE.validation, operations);
        expect(detail.validationRejected).toBe(validation!.count);
      } else {
        expect(detail.validationRejected).toBeUndefined();
      }
    }
  });

  it('matches the ESI failure groups', async () => {
    const groups = esiFailureGroups(await getCapabilityOutcomeStats(range), range);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups).toEqual(withDates(await oracle(ORACLE.esiFailures, [...ESI_FAILURE_OUTCOMES])));
  });

  it('matches the p95 headline and the slowest operations', async () => {
    const latency = await getCapabilityLatency(range);
    const [overall] = await oracle<{ p95: number }>(ORACLE.p95, userFacing);
    expect(latency.p95).toBe(Math.round(overall!.p95));

    type OracleRow = { feature: string; operation: string; p95: number; count: number; duration: number | null; untimed: number | null } & Record<DependencyKind, number>;
    const slowest = await oracle<OracleRow>(ORACLE.slowest, userFacing);
    const heaviest = (row: OracleRow) =>
      DEPENDENCY_KINDS.reduce<DependencyKind | null>(
        (best, kind) => (row[kind] > 0 && (best === null || row[kind] > row[best]) ? kind : best),
        null,
      );
    const clamp = (share: number) => Math.min(1, Math.max(0, share));
    expect(slowest.some((row) => row.untimed !== null)).toBe(true);
    expect(latency.slowest).toEqual(
      slowest.map((row) => {
        const kind = heaviest(row);
        return {
          feature: row.feature,
          operation: row.operation,
          p95Ms: Math.round(row.p95),
          count: row.count,
          slowestDependency: kind,
          slowestShare: kind === null || row.duration === null ? null : expect.closeTo(clamp(row[kind] / row.duration), 9),
          untimedShare: row.untimed === null ? null : expect.closeTo(clamp(row.untimed), 9),
        };
      }),
    );
  });
});

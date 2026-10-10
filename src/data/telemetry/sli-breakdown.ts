import { and, count, eq, max, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { DEPENDENCY_KINDS, type DependencyKind } from '@/lib/dependency-timing';
import { operationsOfKind, USER_FACING_CAPABILITY_KINDS } from './capability';
import {
  roundedP95,
  slowestOperations,
  type CapabilityLatency,
  type CapabilityOutcomeStat,
  type EsiClientErrorGroup,
} from './capability-stats';
import { usageLogs } from './schema';
import {
  CAPABILITY_ACTION,
  capabilityFeature,
  capabilityOperation,
  capabilityRows,
  esiDependent,
  inRange,
  jsonNumber,
  metadataOutcome,
  usageDay,
} from './sql';
import type { DateRange } from './types';

// Failure detail is only kept for outcomes other than `succeeded`, so the
// grouping stays one row per operation for the common case.
function failureOnly(value: SQL): SQL<string | null> {
  return sql<string | null>`case when ${metadataOutcome} <> 'succeeded' then ${value} end`;
}

const outcomeGroup = {
  operation: sql<string | null>`${capabilityOperation}`,
  outcome: metadataOutcome,
  esi: sql<boolean | null>`${esiDependent}`,
  feature: failureOnly(capabilityFeature),
  code: failureOnly(sql`${usageLogs.metadata} ->> 'code'`),
  errorClass: failureOnly(sql`${usageLogs.metadata} ->> 'errorClass'`),
  day: failureOnly(usageDay),
};

/**
 * Every capability outcome in the range, grouped once. The success rates,
 * ESI availability and failure breakdowns all derive from these rows.
 */
export async function getCapabilityOutcomeStats(range: DateRange): Promise<CapabilityOutcomeStat[]> {
  const rows = await db
    .select({ ...outcomeGroup, count: count(), lastSeen: max(usageLogs.timestamp) })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, CAPABILITY_ACTION)))
    .groupBy(...Object.values(outcomeGroup));
  return rows.map((row) => ({ ...row, esi: row.esi === true, count: Number(row.count) }));
}

/** Wall time with this dependency in flight; records written before wallMs existed fall back to summed ms. */
function dependencyMs(kind: DependencyKind) {
  const timing = sql`${usageLogs.metadata} -> 'dependencies' -> ${kind}`;
  return sql<number>`coalesce(
    nullif(${timing} ->> 'wallMs', 'null')::double precision,
    nullif(${timing} ->> 'ms', 'null')::double precision,
    0
  )`;
}

function dependencyColumn(kind: DependencyKind): string {
  return `${kind}_ms`;
}

/**
 * p95 latency across user-facing operations, and per operation. The
 * subquery projects the timings first, so the percentile sort carries
 * numbers rather than whole metadata rows.
 */
export async function getCapabilityLatency(range: DateRange): Promise<CapabilityLatency> {
  const dependencyColumns = Object.fromEntries(
    DEPENDENCY_KINDS.map((kind) => [dependencyColumn(kind), dependencyMs(kind).as(dependencyColumn(kind))]),
  );
  const runs = db
    .select({
      feature: sql<string>`${capabilityFeature}`.as('feature'),
      operation: sql<string>`${capabilityOperation}`.as('operation'),
      durationMs: jsonNumber('durationMs').as('duration_ms'),
      dependencyWallMs: jsonNumber('dependencyWallMs').as('dependency_wall_ms'),
      ...dependencyColumns,
    })
    .from(usageLogs)
    .where(capabilityRows(range, operationsOfKind(...USER_FACING_CAPABILITY_KINDS)))
    .as('runs');
  const runColumns = runs as unknown as Record<string, SQL.Aliased<number>>;
  const average = (column: SQL.Aliased<number>) =>
    sql<number | null>`avg(${column})`.mapWith(Number);
  const dependencyAverages = Object.fromEntries(
    DEPENDENCY_KINDS.map((kind) => [kind, average(runColumns[dependencyColumn(kind)]!)]),
  ) as Record<DependencyKind, SQL<number | null>>;
  const recordedWall = sql`${runs.dependencyWallMs} is not null`;
  const rows = await db
    .select({
      feature: runs.feature,
      operation: runs.operation,
      overall: sql<number>`grouping(${runs.feature}, ${runs.operation})`.mapWith(Number),
      p95: sql<number | null>`percentile_cont(0.95) within group (order by ${runs.durationMs})`.mapWith(Number),
      count: count(),
      durationMs: average(runs.durationMs),
      untimedShare: sql<number | null>`
        avg(${runs.durationMs} - ${runs.dependencyWallMs}) filter (where ${recordedWall})
        / nullif(avg(${runs.durationMs}) filter (where ${recordedWall}), 0)
      `.mapWith(Number),
      ...dependencyAverages,
    })
    .from(runs)
    .groupBy(sql`grouping sets ((${runs.feature}, ${runs.operation}), ())`);

  const operations = rows
    .filter((row) => Number(row.overall) === 0)
    .map((row) => ({
      feature: row.feature,
      operation: row.operation,
      p95: row.p95,
      count: Number(row.count),
      durationMs: row.durationMs,
      untimedShare: row.untimedShare,
      dependencyMs: Object.fromEntries(
        DEPENDENCY_KINDS.map((kind) => [kind, (row as Record<string, unknown>)[kind] as number | null]),
      ) as Record<DependencyKind, number | null>,
    }));
  const overall = rows.find((row) => Number(row.overall) !== 0);
  return { p95: roundedP95(overall?.p95), slowest: slowestOperations(operations) };
}

function esiCount(key: 'status4xx' | 'calls') {
  return sql<number>`coalesce(sum(nullif(${usageLogs.metadata} -> 'dependencies' -> 'esi' ->> ${key}, 'null')::int), 0)`.mapWith(Number);
}

/** ESI calls and 4xx answers per operation, from the operations' own records. */
export async function getEsiClientErrors(range: DateRange): Promise<EsiClientErrorGroup[]> {
  return db
    .select({
      feature: sql<string>`${capabilityFeature}`,
      operation: sql<string>`${capabilityOperation}`,
      errors: esiCount('status4xx'),
      calls: esiCount('calls'),
      lastSeen: max(usageLogs.timestamp),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, CAPABILITY_ACTION), esiDependent))
    .groupBy(capabilityFeature, capabilityOperation);
}

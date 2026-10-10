import { and, count, eq, max, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import type { DependencyKind } from '@/lib/dependency-timing';
import { operationsOfKind, USER_FACING_CAPABILITY_KINDS } from './capability';
import {
  roundedP95,
  slowestOperations,
  type CapabilityLatency,
  type CapabilityOutcomeStat,
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

function dependencyMs(kind: DependencyKind) {
  return sql<number>`coalesce(nullif(${usageLogs.metadata} -> 'dependencies' -> ${kind} ->> 'ms', 'null')::double precision, 0)`;
}

/**
 * p95 latency across user-facing operations, and per operation. The
 * subquery projects the timings first, so the percentile sort carries
 * numbers rather than whole metadata rows.
 */
export async function getCapabilityLatency(range: DateRange): Promise<CapabilityLatency> {
  const runs = db
    .select({
      feature: sql<string>`${capabilityFeature}`.as('feature'),
      operation: sql<string>`${capabilityOperation}`.as('operation'),
      durationMs: jsonNumber('durationMs').as('duration_ms'),
      neonMs: dependencyMs('neon').as('neon_ms'),
      esiMs: dependencyMs('esi').as('esi_ms'),
      redisMs: dependencyMs('redis').as('redis_ms'),
    })
    .from(usageLogs)
    .where(capabilityRows(range, operationsOfKind(...USER_FACING_CAPABILITY_KINDS)))
    .as('runs');
  const average = (column: SQL.Aliased<number>) =>
    sql<number | null>`avg(${column})`.mapWith(Number);
  const rows = await db
    .select({
      feature: runs.feature,
      operation: runs.operation,
      overall: sql<number>`grouping(${runs.feature}, ${runs.operation})`.mapWith(Number),
      p95: sql<number | null>`percentile_cont(0.95) within group (order by ${runs.durationMs})`.mapWith(Number),
      count: count(),
      neon: average(runs.neonMs),
      esi: average(runs.esiMs),
      redis: average(runs.redisMs),
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
      dependencyMs: { neon: row.neon, esi: row.esi, redis: row.redis },
    }));
  const overall = rows.find((row) => Number(row.overall) !== 0);
  return { p95: roundedP95(overall?.p95), slowest: slowestOperations(operations) };
}

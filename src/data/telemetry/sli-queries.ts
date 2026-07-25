// Live values for the five indicators declared in `sli.ts`.
//
// A sibling of `queries.ts` rather than an addition to it: that file sits one
// export below the AF-006 Watch trigger, so the telemetry slice's new query
// surface lands here — the arrangement `cost-queries.ts` and `health-metrics.ts`
// already establish.
//
// Every rate returns `null` for an empty window rather than 0, so the panel can
// render “—” and an idle period is never misread as total failure.
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { operationsOfKind, USER_FACING_CAPABILITY_KINDS } from './capability';
import { usageLogs } from './schema';
import { inRange, jsonInt } from './sql';
import type { DateRange } from './types';

const CAPABILITY_ACTION = 'capability_outcome';

const operation = sql<string>`${usageLogs.metadata} ->> 'operation'`;
const outcome = sql<string>`${usageLogs.metadata} ->> 'outcome'`;

function capabilityRows(range: DateRange, operations: readonly string[]) {
  return and(
    inRange(range),
    eq(usageLogs.action, CAPABILITY_ACTION),
    inArray(operation, [...operations]),
  );
}

/**
 * Share of the given operations that completed without a failure, as a 0–1 ratio.
 * Returns null for a window with no recorded operations.
 */
async function successRatio(
  range: DateRange,
  operations: readonly string[],
  excludedOutcomes: readonly string[] = [],
): Promise<number | null> {
  const excluded =
    excludedOutcomes.length === 0
      ? sql<number>`0`
      : sql<number>`count(*) filter (where ${inArray(outcome, [...excludedOutcomes])})`;

  const [row] = await db
    .select({
      total: count(),
      succeeded: sql<number>`count(*) filter (where ${outcome} = 'succeeded')`.mapWith(Number),
      excluded: excluded.mapWith(Number),
    })
    .from(usageLogs)
    .where(capabilityRows(range, operations));

  const total = Number(row?.total ?? 0) - Number(row?.excluded ?? 0);
  if (total <= 0) return null;
  return Number(row?.succeeded ?? 0) / total;
}

/** Share of POST-bodied tool reads that completed without a failure over the window. */
export function getReadSuccessRate(range: DateRange): Promise<number | null> {
  return successRatio(range, operationsOfKind('read'));
}

/**
 * Share of mutations that succeeded, excluding validation failures: a rejected malformed request is
 * the boundary working as designed, not a service failure, so counting it would hide real breakage.
 */
export function getMutationSuccessRate(range: DateRange): Promise<number | null> {
  return successRatio(range, operationsOfKind('mutation'), ['validation']);
}

/**
 * 95th-percentile total duration across the operations users wait on directly. Returns null for a
 * window with no recorded durations.
 */
export async function getCriticalLatencyP95(range: DateRange): Promise<number | null> {
  const [row] = await db
    .select({
      p95: sql<number | null>`
        percentile_cont(0.95) within group (order by ${jsonInt('durationMs')})
      `.mapWith(Number),
    })
    .from(usageLogs)
    .where(capabilityRows(range, operationsOfKind(...USER_FACING_CAPABILITY_KINDS)));

  const p95 = row?.p95;
  if (p95 === null || p95 === undefined || Number.isNaN(p95)) return null;
  return Math.round(p95);
}

/**
 * Share of ESI-dependent operations that were neither throttled nor failed upstream. Only rows that
 * actually recorded ESI time are counted, so an idle window is null rather than a false 100%.
 */
export async function getEsiSuccessRate(range: DateRange): Promise<number | null> {
  const [row] = await db
    .select({
      total: count(),
      healthy: sql<number>`
        count(*) filter (
          where ${outcome} not in ('rate_limited', 'dependency_unavailable')
        )
      `.mapWith(Number),
    })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        eq(usageLogs.action, CAPABILITY_ACTION),
        sql`${usageLogs.metadata} -> 'dependencies' ? 'esi'`,
      ),
    );

  const total = Number(row?.total ?? 0);
  if (total <= 0) return null;
  return Number(row?.healthy ?? 0) / total;
}

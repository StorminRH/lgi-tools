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

export function getReadSuccessRate(range: DateRange): Promise<number | null> {
  return successRatio(range, operationsOfKind('read'));
}

export function getMutationSuccessRate(range: DateRange): Promise<number | null> {
  return successRatio(range, operationsOfKind('mutation'), ['validation']);
}

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

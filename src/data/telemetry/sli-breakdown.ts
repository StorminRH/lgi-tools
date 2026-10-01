import { and, count, desc, eq, inArray, max, not, sql } from 'drizzle-orm';
import { db } from '@/db';
import type { DependencyKind } from '@/lib/dependency-timing';
import { operationsOfKind, USER_FACING_CAPABILITY_KINDS, type CapabilityKind } from './capability';
import { usageLogs } from './schema';
import {
  CAPABILITY_ACTION,
  capabilityFeature,
  capabilityOperation,
  capabilityOutcome,
  capabilityRows,
  ESI_FAILURE_OUTCOMES,
  esiDependent,
  inRange,
  jsonNumber,
} from './sql';
import type { DateRange } from './types';

const BREAKDOWN_LIMIT = 8;
const SLOWEST_LIMIT = 5;
const DEPENDENCY_KINDS = ['neon', 'esi', 'redis'] as const satisfies readonly DependencyKind[];

const capabilityCode = sql<string>`${usageLogs.metadata} ->> 'code'`;
const capabilityErrorClass = sql<string | null>`${usageLogs.metadata} ->> 'errorClass'`;
const day = sql<string>`to_char(date_trunc('day', ${usageLogs.timestamp}), 'YYYY-MM-DD')`;

export interface FailureGroup {
  feature: string;
  operation: string;
  outcome: string;
  code: string;
  errorClass: string | null;
  count: number;
  lastSeen: Date;
}

export interface DailyFailures {
  day: string;
  failures: number;
}

export interface SlowOperation {
  feature: string;
  operation: string;
  p95Ms: number;
  count: number;
  /** The dependency with the most average time per run, or null when none was timed. */
  slowestDependency: DependencyKind | null;
}

/**
 * Failed operations of one kind, grouped by what failed and how. Outcomes in
 * `excluded` are left out, matching the headline rate they explain.
 */
export async function listCapabilityFailures(
  range: DateRange,
  kind: CapabilityKind,
  excluded: readonly string[] = [],
): Promise<FailureGroup[]> {
  const rows = await db
    .select({
      feature: capabilityFeature,
      operation: capabilityOperation,
      outcome: capabilityOutcome,
      code: capabilityCode,
      errorClass: capabilityErrorClass,
      count: count(),
      lastSeen: max(usageLogs.timestamp),
    })
    .from(usageLogs)
    .where(and(capabilityRows(range, operationsOfKind(kind)), not(inArray(capabilityOutcome, ['succeeded', ...excluded]))))
    .groupBy(capabilityFeature, capabilityOperation, capabilityOutcome, capabilityCode, capabilityErrorClass)
    .orderBy(desc(count()), desc(max(usageLogs.timestamp)))
    .limit(BREAKDOWN_LIMIT);
  return rows.map((row) => ({ ...row, count: Number(row.count), lastSeen: row.lastSeen ?? range.to }));
}

/** Failures per day, so a headline drop reads as current or as old failures still in the window. */
export async function listDailyCapabilityFailures(
  range: DateRange,
  kind: CapabilityKind,
  excluded: readonly string[] = [],
): Promise<DailyFailures[]> {
  const rows = await db
    .select({
      day,
      failures: sql<number>`count(*) filter (where not ${inArray(capabilityOutcome, ['succeeded', ...excluded])})`.mapWith(Number),
    })
    .from(usageLogs)
    .where(capabilityRows(range, operationsOfKind(kind)))
    .groupBy(day)
    .orderBy(day);
  return rows.map((row) => ({ day: row.day, failures: Number(row.failures) }));
}

export async function countCapabilityOutcome(
  range: DateRange,
  kind: CapabilityKind,
  outcome: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(usageLogs)
    .where(and(capabilityRows(range, operationsOfKind(kind)), eq(capabilityOutcome, outcome)));
  return Number(row?.count ?? 0);
}

function dependencyAverage(kind: DependencyKind) {
  return sql<number | null>`avg(coalesce(nullif(${usageLogs.metadata} -> 'dependencies' -> ${kind} ->> 'ms', 'null')::double precision, 0))`.mapWith(
    Number,
  );
}

function slowestDependency(averages: Record<DependencyKind, number | null>): DependencyKind | null {
  let slowest: DependencyKind | null = null;
  for (const kind of DEPENDENCY_KINDS) {
    const ms = averages[kind];
    if (ms === null || Number.isNaN(ms) || ms <= 0) continue;
    if (slowest === null || ms > (averages[slowest] ?? 0)) slowest = kind;
  }
  return slowest;
}

/** The slowest user-facing operations by p95, with where their time went. */
export async function listSlowestOperations(range: DateRange): Promise<SlowOperation[]> {
  const p95 = sql<number>`percentile_cont(0.95) within group (order by ${jsonNumber('durationMs')})`.mapWith(Number);
  const rows = await db
    .select({
      feature: capabilityFeature,
      operation: capabilityOperation,
      p95,
      count: count(),
      neon: dependencyAverage('neon'),
      esi: dependencyAverage('esi'),
      redis: dependencyAverage('redis'),
    })
    .from(usageLogs)
    .where(capabilityRows(range, operationsOfKind(...USER_FACING_CAPABILITY_KINDS)))
    .groupBy(capabilityFeature, capabilityOperation)
    .orderBy(desc(p95))
    .limit(SLOWEST_LIMIT);
  return rows.map((row) => ({
    feature: row.feature,
    operation: row.operation,
    p95Ms: Math.round(row.p95),
    count: Number(row.count),
    slowestDependency: slowestDependency({ neon: row.neon, esi: row.esi, redis: row.redis }),
  }));
}

/** ESI-dependent operations that CCP rate limited or failed, by operation. */
export async function listEsiFailures(range: DateRange): Promise<FailureGroup[]> {
  const rows = await db
    .select({
      feature: capabilityFeature,
      operation: capabilityOperation,
      outcome: capabilityOutcome,
      code: capabilityCode,
      count: count(),
      lastSeen: max(usageLogs.timestamp),
    })
    .from(usageLogs)
    .where(and(
      inRange(range),
      eq(usageLogs.action, CAPABILITY_ACTION),
      esiDependent,
      inArray(capabilityOutcome, [...ESI_FAILURE_OUTCOMES]),
    ))
    .groupBy(capabilityFeature, capabilityOperation, capabilityOutcome, capabilityCode)
    .orderBy(desc(count()), desc(max(usageLogs.timestamp)))
    .limit(BREAKDOWN_LIMIT);
  return rows.map((row) => ({
    ...row,
    errorClass: null,
    count: Number(row.count),
    lastSeen: row.lastSeen ?? range.to,
  }));
}

import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { usageLogs } from './schema';
import type { DateRange } from './types';

export function inRange(range: DateRange) {
  return and(gte(usageLogs.timestamp, range.from), lt(usageLogs.timestamp, range.to));
}

function jsonInt(key: string) {
  return sql<number>`nullif(${usageLogs.metadata} ->> ${key}, 'null')::int`;
}

export function jsonNumber(key: string) {
  return sql<number>`nullif(${usageLogs.metadata} ->> ${key}, 'null')::double precision`;
}

/**
 * The integer metadata key summed over the group, 0 when no row has it.
 * A factory, because `mapWith` mutates the SQL it is called on.
 */
export function summedInt(key: string) {
  return sql<number>`coalesce(sum(${jsonInt(key)}), 0)`.mapWith(Number);
}

// The shared accessors below write their metadata key as a literal, so the
// same fragment renders identical SQL in SELECT and GROUP BY. Wrap one in a
// fresh `sql` before calling `.mapWith()`, which mutates the SQL it is on.

/** The row's UTC calendar day, `YYYY-MM-DD`. */
export const usageDay = sql<string>`(${usageLogs.timestamp} at time zone 'UTC')::date`;

export const metadataOutcome = sql<string | null>`${usageLogs.metadata} ->> 'outcome'`;

export const CAPABILITY_ACTION = 'capability_outcome';

export const capabilityFeature = sql<string>`${usageLogs.metadata} ->> 'feature'`;
export const capabilityOperation = sql<string>`${usageLogs.metadata} ->> 'operation'`;

/** Outcomes that count against ESI availability: CCP limited or failed the call. */
export const ESI_FAILURE_OUTCOMES = ['rate_limited', 'dependency_unavailable'] as const;

export const esiDependent = sql`${usageLogs.metadata} -> 'dependencies' ? 'esi'`;

export function capabilityRows(range: DateRange, operations: readonly string[]) {
  return and(
    inRange(range),
    eq(usageLogs.action, CAPABILITY_ACTION),
    inArray(capabilityOperation, [...operations]),
  );
}

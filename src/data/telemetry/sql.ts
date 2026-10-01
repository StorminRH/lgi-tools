import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { usageLogs } from './schema';
import type { DateRange } from './types';

export function inRange(range: DateRange) {
  return and(gte(usageLogs.timestamp, range.from), lt(usageLogs.timestamp, range.to));
}

export function jsonInt(key: string) {
  return sql<number>`nullif(${usageLogs.metadata} ->> ${key}, 'null')::int`;
}

export function jsonNumber(key: string) {
  return sql<number>`nullif(${usageLogs.metadata} ->> ${key}, 'null')::double precision`;
}

export const CAPABILITY_ACTION = 'capability_outcome';

export const capabilityFeature = sql<string>`${usageLogs.metadata} ->> 'feature'`;
export const capabilityOperation = sql<string>`${usageLogs.metadata} ->> 'operation'`;
export const capabilityOutcome = sql<string>`${usageLogs.metadata} ->> 'outcome'`;

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

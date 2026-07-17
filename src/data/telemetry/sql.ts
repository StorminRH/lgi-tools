import { between, sql } from 'drizzle-orm';
import { usageLogs } from './schema';
import type { DateRange } from './types';

/** Builds the shared half-open SQL timestamp predicate from an inclusive start and exclusive end. */
export function inRange(range: DateRange) {
  return between(usageLogs.timestamp, range.from, range.to);
}

/**
 * Extracts one integer field from JSON telemetry metadata, returning the supplied fallback when
 * absent or malformed.
 */
export function jsonInt(key: string) {
  return sql<number>`nullif(${usageLogs.metadata} ->> ${key}, 'null')::int`;
}

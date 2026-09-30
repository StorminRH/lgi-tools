import { and, gte, lt, sql } from 'drizzle-orm';
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

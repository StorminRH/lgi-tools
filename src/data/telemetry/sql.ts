import { between, sql } from 'drizzle-orm';
import { usageLogs } from './schema';
import type { DateRange } from './types';

export function inRange(range: DateRange) {
  return between(usageLogs.timestamp, range.from, range.to);
}

export function jsonInt(key: string) {
  return sql<number>`nullif(${usageLogs.metadata} ->> ${key}, 'null')::int`;
}

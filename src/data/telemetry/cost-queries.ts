import { and, avg, count, desc, eq, inArray, isNotNull, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import { usageLogs } from './schema';
import { inRange, jsonInt } from './sql';
import type { DateRange } from './types';

/** Price-source aggregate with event count and percentage of the requested total. */
export interface PriceSourceSplit {
  cacheHits: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  requested: number;
  returned: number;
}

/** Market-history source aggregate with event count and percentage of the requested total. */
export interface HistorySourceSplit {
  freshEsi: number;
  warmStored: number;
  staleStored: number;
  missing: number;
}

/** Deferred-write aggregate grouped by dataset and closed outcome taxonomy. */
export interface WriteBehindOutcome {
  action: 'market_price_write_behind' | 'market_history_write_behind';
  outcome: string;
  count: number;
}

/**
 * Endpoint cost aggregate containing calls, item volume, elapsed milliseconds, and estimated
 * resource weight.
 */
export interface CostlyEndpoint {
  endpoint: string;
  count: number;
  avgDurationMs: number;
}

function summedInt(key: string) {
  return sql<number>`coalesce(sum(${jsonInt(key)}), 0)`.mapWith(Number);
}

/** Aggregates price refresh outcomes by canonical source over the requested date range. */
export async function getPriceSourceSplit(range: DateRange): Promise<PriceSourceSplit> {
  const [row] = await db
    .select({
      cacheHits: summedInt('cacheHits'),
      esiCount: summedInt('esiCount'),
      fuzzworkFallbackCount: summedInt('fuzzworkFallbackCount'),
      requested: summedInt('requested'),
      returned: summedInt('returned'),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'market_price_refresh')));
  return {
    cacheHits: Number(row?.cacheHits ?? 0),
    esiCount: Number(row?.esiCount ?? 0),
    fuzzworkFallbackCount: Number(row?.fuzzworkFallbackCount ?? 0),
    requested: Number(row?.requested ?? 0),
    returned: Number(row?.returned ?? 0),
  };
}

/** Aggregates market-history refresh outcomes by canonical source over the requested date range. */
export async function getHistorySourceSplit(range: DateRange): Promise<HistorySourceSplit> {
  const [row] = await db
    .select({
      freshEsi: summedInt('freshEsi'),
      warmStored: summedInt('warmStored'),
      staleStored: summedInt('staleStored'),
      missing: summedInt('missing'),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'market_history_refresh')));
  return {
    freshEsi: Number(row?.freshEsi ?? 0),
    warmStored: Number(row?.warmStored ?? 0),
    staleStored: Number(row?.staleStored ?? 0),
    missing: Number(row?.missing ?? 0),
  };
}

/** Aggregates deferred write-behind outcomes by dataset and terminal result for the requested date range. */
export async function getWriteBehindOutcomes(
  range: DateRange,
): Promise<WriteBehindOutcome[]> {
  const outcome = sql<string>`${usageLogs.metadata} ->> 'outcome'`;
  const rows = await db
    .select({ action: usageLogs.action, outcome, count: count() })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        inArray(usageLogs.action, [
          'market_price_write_behind',
          'market_history_write_behind',
        ]),
        isNotNull(outcome),
      ),
    )
    .groupBy(usageLogs.action, outcome)
    .orderBy(usageLogs.action, desc(count()));
  return rows
    .filter((row) => row.outcome !== null)
    .map((row) => ({
      action: row.action as WriteBehindOutcome['action'],
      outcome: row.outcome as string,
      count: Number(row.count),
    }));
}

/**
 * Returns the highest aggregate endpoint cost totals and latency over the requested window,
 * bounded to the caller's limit.
 */
export async function getTopCostlyEndpoints(
  range: DateRange,
  limit: number,
): Promise<CostlyEndpoint[]> {
  const endpoint = sql<string>`${usageLogs.metadata} ->> 'endpoint'`;
  const duration = jsonInt('durationMs');
  const rows = await db
    .select({
      endpoint,
      count: count(),
      avgDurationMs: avg(duration).mapWith(Number),
      totalDurationMs: sum(duration).mapWith(Number),
    })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        eq(usageLogs.action, 'owned_data_read'),
        isNotNull(endpoint),
        isNotNull(duration),
      ),
    )
    .groupBy(endpoint)
    .orderBy(desc(sum(duration)))
    .limit(limit);
  return rows
    .filter((row) => row.endpoint !== null)
    .map((row) => ({
      endpoint: row.endpoint as string,
      count: Number(row.count),
      avgDurationMs: Math.round(Number(row.avgDurationMs ?? 0)),
    }));
}

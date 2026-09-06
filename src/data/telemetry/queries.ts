import {
  and,
  avg,
  between,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { db } from '@/db';
import { characters } from '@/db/auth-schema';
import { operationsOfKind, USER_FACING_CAPABILITY_KINDS } from './capability';
import { usageLogs } from './schema';
import { inRange, jsonInt } from './sql';
import type {
  CronLastRun,
  CronOutcomeCount,
  DailyCount,
  DateRange,
  DegradationCallerCount,
  EntryPageCount,
  FallbackRateData,
  PathCount,
  ReferrerCount,
  RefreshVolumePoint,
  ReturningVsNew,
  RoleChangeAuditEntry,
  SearchCount,
  SearchVsDirect,
  UsageAction,
} from './types';

export interface LogEventInput {
  action: UsageAction;
  characterId?: number | null;
  metadata?: Record<string, unknown>;
}

export async function logUsageEvent(input: LogEventInput): Promise<void> {
  await db.insert(usageLogs).values({
    action: input.action,
    characterId: input.characterId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function claimPublicEsiBudgetAlert(
  metadata: Record<string, unknown>,
): Promise<number> {
  const [row] = await db
    .insert(usageLogs)
    .values({
      action: 'public_esi_budget_alert_claimed',
      characterId: null,
      metadata,
    })
    .returning({ id: usageLogs.id });
  if (!row) throw new Error('Failed to create public ESI budget alert claim');
  return row.id;
}

export async function completePublicEsiBudgetAlertClaim(id: number): Promise<void> {
  const [row] = await db
    .update(usageLogs)
    .set({ action: 'public_esi_budget_alerted' })
    .where(and(eq(usageLogs.id, id), eq(usageLogs.action, 'public_esi_budget_alert_claimed')))
    .returning({ id: usageLogs.id });
  if (!row) throw new Error('Failed to complete public ESI budget alert claim');
}

export async function pruneUsageLogs(retentionDays: number, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await db.delete(usageLogs).where(lt(usageLogs.timestamp, cutoff));
}

export async function getDailyCounts(range: DateRange): Promise<DailyCount[]> {
  const day = sql<string>`to_char(date_trunc('day', ${usageLogs.timestamp}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      totalEvents: count(),
      uniqueCharacters: countDistinct(usageLogs.characterId),
      anonymousEvents:
        sql<number>`count(*) filter (where ${usageLogs.characterId} is null)`.mapWith(Number),
    })
    .from(usageLogs)
    .where(and(inRange(range), ne(usageLogs.action, 'capability_outcome')))
    .groupBy(day)
    .orderBy(day);

  return rows.map((r) => ({
    day: r.day,
    totalEvents: Number(r.totalEvents),
    uniqueCharacters: Number(r.uniqueCharacters),
    anonymousEvents: Number(r.anonymousEvents),
  }));
}

function topByMetadataKeyQuery(
  metaKey: string,
  action: UsageAction,
  range: DateRange,
  limit: number,
  extraWhere?: ReturnType<typeof eq>,
) {
  const col = sql<string>`${usageLogs.metadata} ->> ${metaKey}`;
  return db
    .select({ value: col, count: count() })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, action), isNotNull(col), extraWhere))
    .groupBy(sql`1`)
    .orderBy(desc(count()))
    .limit(limit);
}

async function topByMetadataKey(
  metaKey: string,
  action: UsageAction,
  range: DateRange,
  limit: number,
  extraWhere?: ReturnType<typeof eq>,
): Promise<{ value: string; count: number }[]> {
  const rows = await topByMetadataKeyQuery(metaKey, action, range, limit, extraWhere);
  return rows
    .filter((r) => r.value !== null)
    .map((r) => ({ value: r.value as string, count: Number(r.count) }));
}

export function topByMetadataKeyToSQL(
  metaKey: string,
  action: UsageAction,
  range: DateRange,
  limit: number,
  extraWhere?: ReturnType<typeof eq>,
) {
  return topByMetadataKeyQuery(metaKey, action, range, limit, extraWhere).toSQL();
}

export async function getTopPages(range: DateRange, limit = 10): Promise<PathCount[]> {
  const rows = await topByMetadataKey('path', 'page_view', range, limit);
  return rows.map((r) => ({ path: r.value, count: r.count }));
}

export async function getTopReferrers(range: DateRange, limit = 10): Promise<ReferrerCount[]> {
  const rows = await topByMetadataKey('referrer', 'page_view', range, limit);
  return rows.map((r) => ({ host: r.value, count: r.count }));
}

export async function getTopEntryPages(range: DateRange, limit = 10): Promise<EntryPageCount[]> {
  const isEntry = sql<string>`${usageLogs.metadata} ->> 'is_entry'`;
  const rows = await topByMetadataKey('path', 'page_view', range, limit, eq(isEntry, 'true'));
  return rows.map((r) => ({ path: r.value, count: r.count }));
}

export async function getTopSearches(range: DateRange, limit = 10): Promise<SearchCount[]> {
  const rows = await topByMetadataKey('query', 'terminal_search', range, limit);
  return rows.map((r) => ({ query: r.value, count: r.count }));
}

export async function getRoleChangeAudit(
  range: DateRange,
  limit = 50,
): Promise<RoleChangeAuditEntry[]> {
  const actor = sql<number | null>`(${usageLogs.metadata} ->> 'actorCharacterId')::bigint`;
  const target = sql<number | null>`(${usageLogs.metadata} ->> 'targetCharacterId')::bigint`;
  const fromRole = sql<string | null>`${usageLogs.metadata} ->> 'from'`;
  const toRole = sql<string | null>`${usageLogs.metadata} ->> 'to'`;

  const rows = await db
    .select({
      timestamp: usageLogs.timestamp,
      actorCharacterId: actor,
      targetCharacterId: target,
      from: fromRole,
      to: toRole,
      actorName: sql<string | null>`(
        select name from characters where character_id = ${actor}
      )`,
      targetName: sql<string | null>`(
        select name from characters where character_id = ${target}
      )`,
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'role_change')))
    .orderBy(desc(usageLogs.timestamp))
    .limit(limit);

  return rows.map((r) => ({
    timestamp: r.timestamp,
    actorCharacterId: r.actorCharacterId === null ? null : Number(r.actorCharacterId),
    actorName: r.actorName,
    targetCharacterId: r.targetCharacterId === null ? null : Number(r.targetCharacterId),
    targetName: r.targetName,
    from: r.from,
    to: r.to,
  }));
}

export async function getFallbackRate(range: DateRange): Promise<FallbackRateData> {
  const esi = sql<number>`coalesce(sum(${jsonInt('esiCount')}), 0)`.mapWith(Number);
  const fallback = sql<number>`coalesce(sum(${jsonInt('fuzzworkFallbackCount')}), 0)`.mapWith(
    Number,
  );
  const day = sql<string>`to_char(date_trunc('day', ${usageLogs.timestamp}), 'YYYY-MM-DD')`;
  const where = and(
    inRange(range),
    eq(usageLogs.action, 'cron_prices'),
    eq(sql`${usageLogs.metadata} ->> 'outcome'`, 'refreshed'),
  );

  const [totals, perDay] = await Promise.all([
    db.select({ esi, fallback }).from(usageLogs).where(where),
    db
      .select({ day, esi, fallback })
      .from(usageLogs)
      .where(where)
      .groupBy(day)
      .orderBy(day),
  ]);

  return {
    esi: Number(totals[0]?.esi ?? 0),
    fallback: Number(totals[0]?.fallback ?? 0),
    perDay: perDay.map((r) => ({
      day: r.day,
      esi: Number(r.esi),
      fallback: Number(r.fallback),
    })),
  };
}

export async function getBudgetExhaustionCount(range: DateRange): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        eq(usageLogs.action, 'price_source_degraded'),
        eq(sql`${usageLogs.metadata} ->> 'budgetExhausted'`, 'true'),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function countPublicEsiBudgetExhaustionsInWindow(
  from: Date,
  to: Date,
): Promise<number> {
  const budgetExhausted = eq(sql`${usageLogs.metadata} ->> 'budgetExhausted'`, 'true');
  const [row] = await db
    .select({ n: count() })
    .from(usageLogs)
    .where(
      and(
        gte(usageLogs.timestamp, from),
        lt(usageLogs.timestamp, to),
        or(
          and(
            eq(usageLogs.action, 'price_source_degraded'),
            eq(sql`${usageLogs.metadata} ->> 'caller'`, 'on-demand'),
            budgetExhausted,
          ),
          and(eq(usageLogs.action, 'market_history_refresh'), budgetExhausted),
        ),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function hasPublicEsiBudgetAlertForWindow(
  windowStartedAt: string,
): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(usageLogs)
    .where(
      and(
        inArray(usageLogs.action, [
          'public_esi_budget_alert_claimed',
          'public_esi_budget_alerted',
        ]),
        eq(sql`${usageLogs.metadata} ->> 'windowStartedAt'`, windowStartedAt),
      ),
    );
  return Number(row?.n ?? 0) > 0;
}

export async function getDegradationByCaller(
  range: DateRange,
): Promise<DegradationCallerCount[]> {
  const caller = sql<string>`${usageLogs.metadata} ->> 'caller'`;
  const rows = await db
    .select({ caller, count: count() })
    .from(usageLogs)
    .where(
      and(inRange(range), eq(usageLogs.action, 'price_source_degraded'), isNotNull(caller)),
    )
    .groupBy(caller)
    .orderBy(desc(count()));
  return rows
    .filter((r) => r.caller !== null)
    .map((r) => ({ caller: r.caller as string, count: Number(r.count) }));
}

async function getCronOutcomes(
  range: DateRange,
  action: UsageAction,
): Promise<CronOutcomeCount[]> {
  const outcome = sql<string>`${usageLogs.metadata} ->> 'outcome'`;
  const avgDurationMs = sql<number>`coalesce(avg(${jsonInt('durationMs')}), 0)`.mapWith(Number);
  const rows = await db
    .select({ outcome, count: count(), avgDurationMs })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, action), isNotNull(outcome)))
    .groupBy(outcome)
    .orderBy(desc(count()));
  return rows
    .filter((r) => r.outcome !== null)
    .map((r) => ({
      outcome: r.outcome as string,
      count: Number(r.count),
      avgDurationMs: Math.round(Number(r.avgDurationMs)),
    }));
}

export function getPriceCronOutcomes(range: DateRange): Promise<CronOutcomeCount[]> {
  return getCronOutcomes(range, 'cron_prices');
}

export function getSdeCronOutcomes(range: DateRange): Promise<CronOutcomeCount[]> {
  return getCronOutcomes(range, 'cron_sde');
}

export function getGscCronOutcomes(range: DateRange): Promise<CronOutcomeCount[]> {
  return getCronOutcomes(range, 'cron_gsc');
}

export async function getLastCronRuns(): Promise<CronLastRun[]> {
  const outcome = sql<string | null>`${usageLogs.metadata} ->> 'outcome'`;
  const rows = await db
    .selectDistinctOn([usageLogs.action], {
      action: usageLogs.action,
      timestamp: usageLogs.timestamp,
      outcome,
    })
    .from(usageLogs)
    .where(inArray(usageLogs.action, ['cron_prices', 'cron_sde', 'cron_gsc']))
    .orderBy(usageLogs.action, desc(usageLogs.timestamp));

  return rows.map((r) => ({
    action: r.action as UsageAction,
    timestamp: r.timestamp,
    outcome: r.outcome,
  }));
}

export async function getRefreshVolume(range: DateRange): Promise<RefreshVolumePoint[]> {
  const day = sql<string>`to_char(date_trunc('day', ${usageLogs.timestamp}), 'YYYY-MM-DD')`;
  const fetched = sql<number>`coalesce(sum(${jsonInt('fetched')}), 0)`.mapWith(Number);
  const written = sql<number>`coalesce(sum(${jsonInt('written')}), 0)`.mapWith(Number);
  const rows = await db
    .select({ day, fetched, written })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        eq(usageLogs.action, 'cron_prices'),
        eq(sql`${usageLogs.metadata} ->> 'outcome'`, 'refreshed'),
      ),
    )
    .groupBy(day)
    .orderBy(day);
  return rows.map((r) => ({
    day: r.day,
    fetched: Number(r.fetched),
    written: Number(r.written),
  }));
}

export async function getReturningVsNew(range: DateRange): Promise<ReturningVsNew> {
  const [newRow, retRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(characters)
      .where(between(characters.createdAt, range.from, range.to)),
    db
      .select({ n: countDistinct(usageLogs.characterId) })
      .from(usageLogs)
      .innerJoin(characters, eq(characters.characterId, usageLogs.characterId))
      .where(
        and(
          inRange(range),
          eq(usageLogs.action, 'auth_login'),
          // Date.toString(), which Postgres can't parse.
          lt(characters.createdAt, range.from),
        ),
      ),
  ]);
  return {
    newUsers: Number(newRow[0]?.n ?? 0),
    returning: Number(retRow[0]?.n ?? 0),
  };
}

export async function getLoginCountsPerUser(range: DateRange): Promise<number[]> {
  const rows = await db
    .select({ c: count() })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        eq(usageLogs.action, 'auth_login'),
        isNotNull(usageLogs.characterId),
      ),
    )
    .groupBy(usageLogs.characterId);
  return rows.map((r) => Number(r.c));
}

export async function getSearchVsDirect(range: DateRange): Promise<SearchVsDirect> {
  const referred = sql<number>`count(*) filter (where ${usageLogs.metadata} ->> 'referrer' is not null)`.mapWith(
    Number,
  );
  const direct = sql<number>`count(*) filter (where ${usageLogs.metadata} ->> 'referrer' is null)`.mapWith(
    Number,
  );
  const [row] = await db
    .select({ referred, direct })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'page_view')));
  return { referred: Number(row?.referred ?? 0), direct: Number(row?.direct ?? 0) };
}

export function lastNDaysRange(days: number, now: Date = new Date()): DateRange {
  const to = now;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

const CAPABILITY_ACTION = 'capability_outcome';

const capabilityOperation = sql<string>`${usageLogs.metadata} ->> 'operation'`;
const capabilityOutcome = sql<string>`${usageLogs.metadata} ->> 'outcome'`;

function capabilityRows(range: DateRange, operations: readonly string[]) {
  return and(
    inRange(range),
    eq(usageLogs.action, CAPABILITY_ACTION),
    inArray(capabilityOperation, [...operations]),
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
      : sql<number>`count(*) filter (where ${inArray(capabilityOutcome, [...excludedOutcomes])})`;

  const [row] = await db
    .select({
      total: count(),
      succeeded: sql<number>`count(*) filter (where ${capabilityOutcome} = 'succeeded')`.mapWith(Number),
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
          where ${capabilityOutcome} not in ('rate_limited', 'dependency_unavailable')
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

export interface PriceSourceSplit {
  cacheHits: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  requested: number;
  returned: number;
}

export interface HistorySourceSplit {
  freshEsi: number;
  warmStored: number;
  staleStored: number;
  missing: number;
}

export interface WriteBehindOutcome {
  action: 'market_price_write_behind' | 'market_history_write_behind';
  outcome: string;
  count: number;
}

export interface CostlyEndpoint {
  endpoint: string;
  count: number;
  avgDurationMs: number;
}

function summedInt(key: string) {
  return sql<number>`coalesce(sum(${jsonInt(key)}), 0)`.mapWith(Number);
}

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

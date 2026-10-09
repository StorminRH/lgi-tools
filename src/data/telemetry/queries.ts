import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm';
import { EVE_SSO_HOST } from '@/lib/eve-provider';
import { db } from '@/db';
import { account, user } from '@/db/auth-schema';
import {
  readWindow,
  splitAudience,
  splitPageViewPeriods,
  splitRankings,
  type PageViewRankings,
  type PageViewStats,
  type PeriodPair,
  type RankedList,
  type RankedRow,
} from './page-view-stats';
import { usageLogs } from './schema';
import {
  CAPABILITY_ACTION,
  capabilityOutcome,
  ESI_FAILURE_OUTCOMES,
  esiDependent,
  inRange,
  jsonInt,
  jsonNumber,
} from './sql';
import type {
  CronLastRun,
  CronOutcomeCount,
  DateRange,
  DegradationCallerCount,
  FallbackRateData,
  RefreshVolumePoint,
  ReturningVsNew,
  RoleChangeAuditEntry,
  UsageAction,
} from './types';

export {
  claimPublicEsiBudgetAlert,
  completePublicEsiBudgetAlertClaim,
  logUsageEvent,
  pruneUsageLogs,
} from './log';

const pagePath = sql<string | null>`${usageLogs.metadata} ->> 'path'`;
const pageReferrer = sql<string | null>`${usageLogs.metadata} ->> 'referrer'`;
const isEntry = sql`${usageLogs.metadata} ->> 'is_entry' = 'true'`;
// An EVE SSO bounce is the login round trip, not a referral.
const externalReferrer = sql`${pageReferrer} is not null and lower(${pageReferrer}) <> ${EVE_SSO_HOST}`;

/**
 * Page views per UTC day for the range and, when given, the period just
 * before it, in one scan. The previous period must end where the range
 * starts.
 */
export async function getPageViewStats(range: DateRange, previous: DateRange | null): Promise<PageViewStats> {
  const rows = await db
    .select({
      current: sql<boolean>`${gte(usageLogs.timestamp, range.from)}`,
      day: sql<string>`(${usageLogs.timestamp} at time zone 'UTC')::date`,
      views: count(),
      entries: sql<number>`count(*) filter (where ${isEntry})`.mapWith(Number),
      referrals: sql<number>`count(*) filter (where ${externalReferrer})`.mapWith(Number),
    })
    .from(usageLogs)
    .where(and(inRange(readWindow(range, previous)), eq(usageLogs.action, 'page_view')))
    // The period test binds the range start, so group by position rather
    // than repeat it as a second, different parameter.
    .groupBy(sql`1`, sql`2`);
  return splitPageViewPeriods(rows, previous !== null);
}

/**
 * The top pages, entry pages and external referrers in one scan: one
 * grouping set per list, ranked within its set.
 */
export async function getPageViewRankings(range: DateRange, limit = 10): Promise<PageViewRankings> {
  // Project first, so the grouping sets reference plain columns rather than
  // expressions carrying the bound SSO host.
  const views = db
    .select({
      path: sql<string | null>`${pagePath}`.as('path'),
      entryPath: sql<string | null>`case when ${isEntry} then ${pagePath} end`.as('entry_path'),
      referrer: sql<string | null>`case when ${externalReferrer} then ${pageReferrer} end`.as('referrer'),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'page_view')))
    .as('views');
  const list = sql<RankedList>`case
    when grouping(${views.path}) = 0 then 'pages'
    when grouping(${views.entryPath}) = 0 then 'entries'
    else 'referrers' end`;
  // Within a set the other two columns are null, so this is the set's value.
  const value = sql<string | null>`coalesce(${views.path}, ${views.entryPath}, ${views.referrer})`;
  const ranked = db
    .select({
      list: list.as('list'),
      value: value.as('value'),
      count: count().as('count'),
      rn: sql<number>`row_number() over (partition by ${list} order by count(*) desc, ${value})`.as('rn'),
    })
    .from(views)
    .groupBy(sql`grouping sets ((${views.path}), (${views.entryPath}), (${views.referrer}))`)
    .having(sql`${value} is not null`)
    .as('ranked');
  const rows = await db
    .select({ list: ranked.list, value: ranked.value, count: ranked.count })
    .from(ranked)
    .where(lte(ranked.rn, limit))
    .orderBy(ranked.list, ranked.rn);
  return splitRankings(rows as RankedRow[]);
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
  const avgDurationMs = sql<number>`coalesce(avg(${jsonNumber('durationMs')}), 0)`.mapWith(Number);
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

export function getHousekeepingCronOutcomes(range: DateRange): Promise<CronOutcomeCount[]> {
  return getCronOutcomes(range, 'cron_housekeeping');
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
    .where(inArray(usageLogs.action, ['cron_prices', 'cron_sde', 'cron_gsc', 'cron_housekeeping']))
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

// Resolve recorded characters to their current human account, once per EVE account.
const activityAccount = and(
  eq(account.providerId, 'eve'),
  eq(account.accountId, sql<string>`${usageLogs.characterId}::text`),
);
const audienceActions = ['page_view', 'auth_login'] as const;

/**
 * Active users new to the range or returning to it, for the range and,
 * when given, the contiguous period before it. Characters are deduplicated
 * before they are resolved to users.
 */
export async function getReturningVsNew(
  range: DateRange,
  previous: DateRange | null,
): Promise<PeriodPair<ReturningVsNew>> {
  const active = db
    .select({
      characterId: usageLogs.characterId,
      inCurrent: sql<boolean>`bool_or(${gte(usageLogs.timestamp, range.from)})`.as('in_current'),
      inPrevious: sql<boolean>`bool_or(${lt(usageLogs.timestamp, range.from)})`.as('in_previous'),
    })
    .from(usageLogs)
    .where(and(
      inRange(readWindow(range, previous)),
      inArray(usageLogs.action, [...audienceActions]),
      isNotNull(usageLogs.characterId),
    ))
    .groupBy(usageLogs.characterId)
    .as('active');
  const users = (period: SQL, joined: SQL) =>
    sql<number>`count(distinct ${user.id}) filter (where ${period} and ${joined})`.mapWith(Number);
  const previousFrom = previous?.from ?? range.from;
  const [row] = await db
    .select({
      newUsers: users(sql`${active.inCurrent}`, gte(user.createdAt, range.from)),
      returning: users(sql`${active.inCurrent}`, lt(user.createdAt, range.from)),
      previousNew: users(sql`${active.inPrevious}`, gte(user.createdAt, previousFrom)),
      previousReturning: users(sql`${active.inPrevious}`, lt(user.createdAt, previousFrom)),
    })
    .from(active)
    .innerJoin(account, and(eq(account.providerId, 'eve'), eq(account.accountId, sql<string>`${active.characterId}::text`)))
    .innerJoin(user, eq(user.id, account.userId));
  return splitAudience(row, previous !== null);
}

export async function getLoginCountsPerUser(range: DateRange): Promise<number[]> {
  const rows = await db.select({ c: count() }).from(usageLogs)
    .innerJoin(account, activityAccount)
    .where(and(inRange(range), eq(usageLogs.action, 'auth_login')))
    .groupBy(account.userId);
  return rows.map((r) => Number(r.c));
}

export function lastNDaysRange(days: number, now: Date = new Date()): DateRange {
  const to = now;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getEsiAvailability(range: DateRange) {
  const [row] = await db
    .select({
      total: count(),
      healthy: sql<number>`
        count(*) filter (
          where not ${inArray(capabilityOutcome, [...ESI_FAILURE_OUTCOMES])}
        )
      `.mapWith(Number),
    })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        eq(usageLogs.action, CAPABILITY_ACTION),
        esiDependent,
      ),
    );

  const total = Number(row?.total ?? 0);
  const healthy = Number(row?.healthy ?? 0);
  return { total, healthy, rate: total > 0 ? healthy / total : null };
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
  const duration = jsonNumber('durationMs');
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
    .orderBy(desc(count()), endpoint)
    .limit(limit);
  return rows
    .filter((row) => row.endpoint !== null)
    .map((row) => ({
      endpoint: row.endpoint as string,
      count: Number(row.count),
      avgDurationMs: Math.round(Number(row.avgDurationMs ?? 0)),
    }));
}

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
import { daysBefore } from '@/lib/iso-date';
import { db } from '@/db';
import { account, user } from '@/db/auth-schema';
import { CRON_ACTIONS, splitCronOutcomes, type CronOutcomes, type PriceRefreshDay } from './cron-stats';
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
import { priceSourceDegradation, type PriceSourceDegradation } from './price-source-stats';
import { usageLogs } from './schema';
import {
  CAPABILITY_ACTION,
  ESI_FAILURE_OUTCOMES,
  esiDependent,
  inRange,
  jsonNumber,
  metadataOutcome,
  summedInt,
  usageDay,
} from './sql';
import type {
  CronLastRun,
  DateRange,
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
const priceCaller = sql<string | null>`${usageLogs.metadata} ->> 'caller'`;
const budgetExhausted = eq(sql`${usageLogs.metadata} ->> 'budgetExhausted'`, 'true');

/**
 * Page views per UTC day for the range and, when given, the period just
 * before it, in one scan. The previous period must end where the range
 * starts.
 */
export async function getPageViewStats(range: DateRange, previous: DateRange | null): Promise<PageViewStats> {
  const rows = await db
    .select({
      current: sql<boolean>`${gte(usageLogs.timestamp, range.from)}`,
      day: usageDay,
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
    // Matches the index's `desc nulls last`, so the limit reads only the newest rows.
    .orderBy(sql`${usageLogs.timestamp} desc nulls last`)
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

/**
 * What each successful price refresh fetched, wrote, and took from ESI or
 * the Fuzzwork fallback, per UTC day. The fallback rate and the refresh
 * volume both derive from it.
 */
export async function getPriceRefreshDays(range: DateRange): Promise<PriceRefreshDay[]> {
  const rows = await db
    .select({
      day: usageDay,
      esi: summedInt('esiCount'),
      fallback: summedInt('fuzzworkFallbackCount'),
      fetched: summedInt('fetched'),
      written: summedInt('written'),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'cron_prices'), eq(metadataOutcome, 'refreshed')))
    .groupBy(usageDay)
    .orderBy(usageDay);
  return rows.map((r) => ({
    day: r.day,
    esi: Number(r.esi),
    fallback: Number(r.fallback),
    fetched: Number(r.fetched),
    written: Number(r.written),
  }));
}

export async function countPublicEsiBudgetExhaustionsInWindow(
  from: Date,
  to: Date,
): Promise<number> {
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
            eq(priceCaller, 'on-demand'),
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

/**
 * Degraded price reads by caller, with how many hit an exhausted ESI
 * budget, in one scan.
 */
export async function getPriceSourceDegradation(range: DateRange): Promise<PriceSourceDegradation> {
  const rows = await db
    .select({
      caller: priceCaller,
      count: count(),
      budgetExhausted: sql<number>`count(*) filter (where ${budgetExhausted})`.mapWith(Number),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'price_source_degraded')))
    .groupBy(priceCaller);
  return priceSourceDegradation(rows);
}

/** Runs of every tracked cron by outcome, most frequent first within each. */
export async function getCronOutcomes(range: DateRange): Promise<CronOutcomes> {
  // isNotNull below drops runs with no outcome, so every grouped one is a string.
  const outcome = sql<string>`${metadataOutcome}`;
  const avgDurationMs = sql<number>`coalesce(avg(${jsonNumber('durationMs')}), 0)`.mapWith(Number);
  const rows = await db
    .select({ action: usageLogs.action, outcome, count: count(), avgDurationMs })
    .from(usageLogs)
    .where(and(inRange(range), inArray(usageLogs.action, [...CRON_ACTIONS]), isNotNull(outcome)))
    .groupBy(usageLogs.action, outcome)
    .orderBy(usageLogs.action, desc(count()), outcome);
  return splitCronOutcomes(rows);
}

/**
 * The latest run of each tracked cron, at any time. Each is one step down
 * the action and timestamp index, so the read stays a few rows however
 * long the log grows.
 */
export async function getLastCronRuns(): Promise<CronLastRun[]> {
  const lastRun = db
    .select({
      timestamp: usageLogs.timestamp,
      outcome: metadataOutcome.as('outcome'),
    })
    .from(usageLogs)
    .where(eq(usageLogs.action, sql`cron.action`))
    // Matches the index's `desc nulls last`, so the limit stops at one row.
    .orderBy(sql`${usageLogs.timestamp} desc nulls last`)
    .limit(1)
    .as('last_run');
  const rows = await db
    .select({ action: sql<UsageAction>`cron.action`, timestamp: lastRun.timestamp, outcome: lastRun.outcome })
    .from(sql`unnest(${sql.param([...CRON_ACTIONS])}::text[]) as cron(action)`)
    .innerJoinLateral(lastRun, sql`true`);
  return rows.map((r) => ({ action: r.action, timestamp: r.timestamp, outcome: r.outcome }));
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
  return { from: daysBefore(now, days), to: now };
}

export async function getEsiAvailability(range: DateRange) {
  const [row] = await db
    .select({
      total: count(),
      healthy: sql<number>`
        count(*) filter (
          where not ${inArray(metadataOutcome, [...ESI_FAILURE_OUTCOMES])}
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
  const rows = await db
    .select({ action: usageLogs.action, outcome: metadataOutcome, count: count() })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        inArray(usageLogs.action, [
          'market_price_write_behind',
          'market_history_write_behind',
        ]),
        isNotNull(metadataOutcome),
      ),
    )
    .groupBy(usageLogs.action, metadataOutcome)
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

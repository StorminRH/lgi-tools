import {
  and,
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
} from 'drizzle-orm';
import { db } from '@/db';
import { characters } from '@/db/auth-schema';
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

/**
 * Atomically claims one public ESI budget-alert window so concurrent cron runs cannot send
 * duplicate notifications.
 */
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

/**
 * Bound the otherwise-unbounded usage_logs table (one row per page view plus
 * each ESI/degradation/cron event): drop rows past the retention window. Hosted
 * on the daily GSC cron. Idempotent — a re-run only deletes newly-aged rows — so
 * it needs no lock of its own. The cutoff is computed in JS (driver-agnostic,
 * matching the market-history prune) rather than via SQL now().
 */
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

/**
 * Top referrer hostnames among page_view events. TelemetryReporter only
 * writes metadata.referrer when the referring origin is different from the
 * current host, so same-origin page-hops never appear here. Joining on
 * `path = '/sites'` would over-narrow it — we want acquisition across the
 * whole platform.
 */
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

/**
 * Count one canonical degradation row per price refresh whose ESI budget was
 * exhausted. A degraded cron also writes a cron_prices outcome row, so counting
 * both actions would double the same incident.
 */
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

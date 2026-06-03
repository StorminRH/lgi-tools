import { and, between, count, countDistinct, desc, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { characters } from '@/features/auth/schema';
import { usageLogs } from './schema';
import type {
  ActionCount,
  AggregateSummary,
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
  SitesViewSplit,
  UsageAction,
  UtmSourceCount,
} from './types';

interface LogEventInput {
  action: UsageAction;
  characterId?: number | null;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget INSERT. Callers can await for tests; production paths
// generally don't because telemetry failures must never break user flows.
export async function logUsageEvent(input: LogEventInput): Promise<void> {
  await db.insert(usageLogs).values({
    action: input.action,
    characterId: input.characterId ?? null,
    metadata: input.metadata ?? {},
  });
}

function inRange(range: DateRange) {
  return between(usageLogs.timestamp, range.from, range.to);
}

export async function getAggregateSummary(range: DateRange): Promise<AggregateSummary> {
  const [row] = await db
    .select({
      totalEvents: count(),
      uniqueCharacters: countDistinct(usageLogs.characterId),
      anonymousEvents: sql<number>`count(*) filter (where ${usageLogs.characterId} is null)`.mapWith(
        Number,
      ),
    })
    .from(usageLogs)
    .where(inRange(range));

  return {
    totalEvents: Number(row?.totalEvents ?? 0),
    uniqueCharacters: Number(row?.uniqueCharacters ?? 0),
    anonymousEvents: Number(row?.anonymousEvents ?? 0),
  };
}

export async function getTopActions(
  range: DateRange,
  limit = 10,
): Promise<ActionCount[]> {
  const rows = await db
    .select({
      action: usageLogs.action,
      count: count(),
    })
    .from(usageLogs)
    .where(inRange(range))
    .groupBy(usageLogs.action)
    .orderBy(desc(count()))
    .limit(limit);

  return rows.map((r) => ({
    action: r.action as UsageAction,
    count: Number(r.count),
  }));
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
    .where(inRange(range))
    .groupBy(day)
    .orderBy(day);

  return rows.map((r) => ({
    day: r.day,
    totalEvents: Number(r.totalEvents),
    uniqueCharacters: Number(r.uniqueCharacters),
    anonymousEvents: Number(r.anonymousEvents),
  }));
}

export async function getTopPages(range: DateRange, limit = 10): Promise<PathCount[]> {
  const path = sql<string>`${usageLogs.metadata} ->> 'path'`;
  const rows = await db
    .select({
      path,
      count: count(),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'page_view'), isNotNull(path)))
    .groupBy(path)
    .orderBy(desc(count()))
    .limit(limit);

  return rows
    .filter((r) => r.path !== null)
    .map((r) => ({ path: r.path as string, count: Number(r.count) }));
}

// Top referrer hostnames among page_view events. TelemetryReporter only
// writes metadata.referrer when the referring origin is different from the
// current host, so same-origin page-hops never appear here. Joining on
// `path = '/sites'` would over-narrow it — we want acquisition across the
// whole platform.
export async function getTopReferrers(
  range: DateRange,
  limit = 10,
): Promise<ReferrerCount[]> {
  const host = sql<string>`${usageLogs.metadata} ->> 'referrer'`;
  const rows = await db
    .select({ host, count: count() })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'page_view'), isNotNull(host)))
    .groupBy(host)
    .orderBy(desc(count()))
    .limit(limit);

  return rows
    .filter((r) => r.host !== null)
    .map((r) => ({ host: r.host as string, count: Number(r.count) }));
}

// Top utm_source values. metadata.utm is a nested JSON object so we extract
// via `metadata -> 'utm' ->> 'source'`. Future-medium/campaign panels can
// follow the same shape; one query per dimension keeps the SQL flat.
export async function getTopUtmSources(
  range: DateRange,
  limit = 10,
): Promise<UtmSourceCount[]> {
  const source = sql<string>`${usageLogs.metadata} -> 'utm' ->> 'source'`;
  const rows = await db
    .select({ source, count: count() })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'page_view'), isNotNull(source)))
    .groupBy(source)
    .orderBy(desc(count()))
    .limit(limit);

  return rows
    .filter((r) => r.source !== null)
    .map((r) => ({ source: r.source as string, count: Number(r.count) }));
}

// Top entry pages — paths where metadata.is_entry is true. Tracks the first
// page-view per browser session, so this aggregates landing pages rather
// than every page a user opens after they're already on the site.
export async function getTopEntryPages(
  range: DateRange,
  limit = 10,
): Promise<EntryPageCount[]> {
  const path = sql<string>`${usageLogs.metadata} ->> 'path'`;
  const isEntry = sql<string>`${usageLogs.metadata} ->> 'is_entry'`;
  const rows = await db
    .select({ path, count: count() })
    .from(usageLogs)
    .where(and(
      inRange(range),
      eq(usageLogs.action, 'page_view'),
      isNotNull(path),
      eq(isEntry, 'true'),
    ))
    .groupBy(path)
    .orderBy(desc(count()))
    .limit(limit);

  return rows
    .filter((r) => r.path !== null)
    .map((r) => ({ path: r.path as string, count: Number(r.count) }));
}

export async function getTopSearches(
  range: DateRange,
  limit = 10,
): Promise<SearchCount[]> {
  const query = sql<string>`${usageLogs.metadata} ->> 'query'`;
  const rows = await db
    .select({
      query,
      count: count(),
    })
    .from(usageLogs)
    .where(and(inRange(range), eq(usageLogs.action, 'terminal_search'), isNotNull(query)))
    .groupBy(query)
    .orderBy(desc(count()))
    .limit(limit);

  return rows
    .filter((r) => r.query !== null)
    .map((r) => ({ query: r.query as string, count: Number(r.count) }));
}

export async function getRoleChangeAudit(
  range: DateRange,
  limit = 50,
): Promise<RoleChangeAuditEntry[]> {
  // Actor is whoever fired the change (read from session at write time, stored
  // in metadata.actorCharacterId). Target is metadata.targetCharacterId. Both
  // joined to characters so we can render names. Either may be null if the
  // character row was deleted between change and read.
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

// Aggregates /sites page views by which view they used. `metadata.search`
// stores the raw query string (e.g., "view=table&type=ore"). The match
// anchors on a parameter boundary (either start-of-string or after `&`)
// so a future param whose value happens to include the substring
// `view=table` doesn't accidentally count. Filters on `path = '/sites'`
// exactly so /sites/[id] detail-page hits are excluded.
export async function getSitesViewSplit(range: DateRange): Promise<SitesViewSplit> {
  const search = sql<string>`(${usageLogs.metadata} ->> 'search')`;
  const isTable = sql<boolean>`(${search} LIKE 'view=table%' OR ${search} LIKE '%&view=table%')`;
  const rows = await db
    .select({ isTable, count: count() })
    .from(usageLogs)
    .where(and(
      inRange(range),
      eq(usageLogs.action, 'page_view'),
      eq(sql`${usageLogs.metadata} ->> 'path'`, '/sites'),
    ))
    .groupBy(isTable);

  let cards = 0;
  let table = 0;
  for (const r of rows) {
    if (r.isTable) table += Number(r.count);
    else cards += Number(r.count);
  }
  return { cards, table };
}

// ── Health dashboard aggregates (3.2.13) ────────────────────────────────
// JSON numeric fields are read with `nullif(... ->> 'k', 'null')::int` — a
// JSON literal `null` stringifies to 'null' and `'null'::int` raises, while an
// absent key yields SQL NULL (safe). Filtered sums are `coalesce(...,0)` so a
// zero-match window reads as 0, not NULL. All division/bucketing is deferred
// to the caller (health-metrics.ts) — these queries only emit raw counts.

function jsonInt(key: string) {
  return sql<number>`nullif(${usageLogs.metadata} ->> ${key}, 'null')::int`;
}

// ESI vs Fuzzwork-fallback source split over `cron_prices` refreshed rows,
// with a per-day series for the fallback-rate trend. The caller turns these
// into a rate (and distinguishes a real 0% from an empty window).
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

// Count of runs that recorded `budgetExhausted: true` — the ESI error-budget
// floor was hit and the sweep fell back. Counted across both the cron outcome
// rows and the dedicated degradation rows (deduped by the caller is overkill —
// these answer "how often did we hit the floor", a frequency, not a unique set).
export async function getBudgetExhaustionCount(range: DateRange): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(usageLogs)
    .where(
      and(
        inRange(range),
        eq(sql`${usageLogs.metadata} ->> 'budgetExhausted'`, 'true'),
      ),
    );
  return Number(row?.n ?? 0);
}

// Degradation events grouped by caller (`cron` vs `on-demand`). `caller` only
// exists on `price_source_degraded` rows, which are emitted only when degraded
// — so this is the mix of degradation events by origin, not of all refreshes.
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

// Per-outcome run counts + average duration for one cron action. Average is
// over rows that recorded a numeric `durationMs` (avg skips NULLs); a window
// with no such rows yields 0. Used for both health % and the duration view.
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

// Per-day fetched/written totals from `cron_prices` refreshed rows.
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

// Returning-vs-new authenticated users over the window. "New" = accounts
// created in-window; "returning" = distinct characters that logged in during
// the window whose account predates it. A user can be in at most one bucket;
// dormant accounts (created before, no login in-window) are in neither.
// Counts only — no character id or name leaves this function.
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
          // Typed comparison (not a raw `sql` fragment) so the Date is bound
          // as a real timestamp — a raw interpolation serializes it via
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

// Per-user login counts over the window, returned as a bare count list (no
// identity). The caller buckets these into a frequency histogram.
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

// Referred (carried an external referrer) vs direct page views. Same referrer
// rule as getTopReferrers: TelemetryReporter only writes metadata.referrer for
// a cross-origin referrer, so "direct" folds in same-origin and untagged hits.
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

// Convenience for routes that want a quick "last 7d" snapshot.
export function lastNDaysRange(days: number, now: Date = new Date()): DateRange {
  const to = now;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

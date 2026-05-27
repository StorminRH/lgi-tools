import { and, between, count, countDistinct, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { usageLogs } from './schema';
import type {
  ActionCount,
  AggregateSummary,
  DailyCount,
  DateRange,
  PathCount,
  RoleChangeAuditEntry,
  SearchCount,
  UsageAction,
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

// Convenience for routes that want a quick "last 7d" snapshot.
export function lastNDaysRange(days: number, now: Date = new Date()): DateRange {
  const to = now;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { account, user } from '@/db/auth-schema';
import { pageViewSources, pageViewTotals } from './page-view-stats';
import { getPageViewRankings, getPageViewStats, getReturningVsNew } from './queries';
import { usageLogs } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_page_views',
  tables: ['usage_logs', 'user', 'account'],
  steerDbProxy: true,
});

const RANGE = { from: new Date('2032-03-08T09:30:00Z'), to: new Date('2032-03-15T09:30:00Z') };
const PREVIOUS = { from: new Date('2032-03-01T09:30:00Z'), to: RANGE.from };
const HOUR = 3_600_000;

// The per-figure queries the combined reads replaced, kept as the reference
// they must agree with. Days are UTC, as the combined read buckets them.
const WHERE = `"timestamp" >= $1::timestamptz and "timestamp" < $2::timestamptz and action = 'page_view'`;
const REFERRED = `metadata ->> 'referrer' is not null and lower(metadata ->> 'referrer') <> 'login.eveonline.com'`;
const ORACLE = {
  daily: `
    select (("timestamp" at time zone 'UTC')::date)::text as day, count(*)::int as views
    from usage_logs where ${WHERE} group by 1 order by 1`,
  totals: `
    select count(*)::int as views,
      count(*) filter (where metadata ->> 'is_entry' = 'true')::int as entries,
      count(*) filter (where ${REFERRED})::int as referrals,
      count(*) filter (where (metadata ->> 'referrer' is null or lower(metadata ->> 'referrer') = 'login.eveonline.com'))::int as direct
    from usage_logs where ${WHERE}`,
  top: (key: string, extra: string) => `
    select metadata ->> '${key}' as value, count(*)::int as count
    from usage_logs where ${WHERE} and metadata ->> '${key}' is not null ${extra}
    group by 1 order by 2 desc, 1 limit 10`,
  audience: `
    select count(distinct u.id) filter (where u.created_at >= $3::timestamp)::int as "newUsers",
      count(distinct u.id) filter (where u.created_at < $3::timestamp)::int as returning
    from usage_logs l
    join account a on a.provider_id = 'eve' and a.account_id = l.character_id::text
    join "user" u on u.id = a.user_id
    where l."timestamp" >= $1::timestamptz and l."timestamp" < $2::timestamptz
      and l.action in ('page_view', 'auth_login')`,
};

// `user.created_at` has no time zone; the replaced query compared it with the
// range start's UTC wall clock, so the oracle passes that separately.
function oracle<T>(query: string, range: { from: Date; to: Date }): Promise<T[]> {
  const from = range.from.toISOString();
  const params = query.includes('$3') ? [from, range.to.toISOString(), from] : [from, range.to.toISOString()];
  return harness.sql.unsafe(query, params) as unknown as Promise<T[]>;
}

type Row = typeof usageLogs.$inferInsert;
const at = (base: Date, hours: number) => new Date(base.getTime() + hours * HOUR);

/** Page views with distinct counts per path, entry path and referrer, so every top-ten cut is unambiguous. */
function pageViews(base: Date): Row[] {
  const rows: Row[] = [];
  for (let page = 0; page < 14; page++) {
    for (let view = 0; view <= page; view++) {
      const metadata: Record<string, unknown> = { path: `/page-${page}` };
      if (view < page) metadata.is_entry = 'true';
      rows.push({ action: 'page_view', timestamp: at(base, page * 7 + view * 5), metadata });
    }
  }
  for (let host = 0; host < 13; host++) {
    for (let view = 0; view <= host; view++) {
      rows.push({
        action: 'page_view',
        timestamp: at(base, host * 11 + view * 2 + 0.5),
        metadata: { path: '/from-search', referrer: `search-${host}.example` },
      });
    }
  }
  rows.push(
    { action: 'page_view', timestamp: at(base, 2), metadata: { path: '/sso', referrer: 'login.eveonline.com' } },
    { action: 'page_view', timestamp: at(base, 30), metadata: { path: '/sso', referrer: 'LOGIN.EVEONLINE.COM' } },
    { action: 'page_view', timestamp: at(base, 40), metadata: { is_entry: 'true', referrer: 'search-12.example' } },
    { action: 'page_view', timestamp: at(base, 41), metadata: { path: null, is_entry: 'true' } },
    { action: 'page_view', timestamp: at(base, 42), metadata: {} },
    { action: 'capability_outcome', timestamp: at(base, 43), metadata: { path: '/page-0', referrer: 'search-0.example' } },
  );
  return rows;
}

const CHARACTERS = { early: 92_000_001, earlyAlt: 92_000_002, middle: 92_000_003, late: 92_000_004, unlinked: 92_000_005, otherProvider: 92_000_006 };

describe.skipIf(!harness.reachable)('page-view reads agree with the per-figure queries they replaced', () => {
  beforeAll(async () => {
    await harness.db.insert(user).values([
      { id: 'pv-early', name: 'Early', email: 'pv-early@example.test', createdAt: new Date('2031-01-01T00:00:00Z') },
      { id: 'pv-middle', name: 'Middle', email: 'pv-middle@example.test', createdAt: at(PREVIOUS.from, 30) },
      { id: 'pv-late', name: 'Late', email: 'pv-late@example.test', createdAt: at(RANGE.from, 30) },
      { id: 'pv-other', name: 'Other', email: 'pv-other@example.test', createdAt: at(RANGE.from, 1) },
    ]);
    await harness.db.insert(account).values([
      { id: 'pv-early-main', accountId: String(CHARACTERS.early), providerId: 'eve', userId: 'pv-early' },
      { id: 'pv-early-alt', accountId: String(CHARACTERS.earlyAlt), providerId: 'eve', userId: 'pv-early' },
      { id: 'pv-middle-main', accountId: String(CHARACTERS.middle), providerId: 'eve', userId: 'pv-middle' },
      { id: 'pv-late-main', accountId: String(CHARACTERS.late), providerId: 'eve', userId: 'pv-late' },
      { id: 'pv-other-main', accountId: String(CHARACTERS.otherProvider), providerId: 'discord', userId: 'pv-other' },
    ]);
    const audience: Row[] = [
      { action: 'page_view', characterId: CHARACTERS.early, timestamp: at(PREVIOUS.from, 1) },
      { action: 'auth_login', characterId: CHARACTERS.earlyAlt, timestamp: at(PREVIOUS.from, 2) },
      { action: 'auth_login', characterId: CHARACTERS.middle, timestamp: at(PREVIOUS.from, 40) },
      { action: 'page_view', characterId: CHARACTERS.middle, timestamp: at(RANGE.from, 3) },
      { action: 'page_view', characterId: CHARACTERS.middle, timestamp: at(RANGE.from, 4) },
      { action: 'auth_login', characterId: CHARACTERS.late, timestamp: at(RANGE.from, 50) },
      { action: 'page_view', characterId: CHARACTERS.earlyAlt, timestamp: at(RANGE.from, 60) },
      { action: 'page_view', characterId: CHARACTERS.unlinked, timestamp: at(RANGE.from, 61) },
      { action: 'page_view', characterId: CHARACTERS.otherProvider, timestamp: at(RANGE.from, 62) },
      { action: 'cron_prices', characterId: CHARACTERS.early, timestamp: at(RANGE.from, 63), metadata: { outcome: 'refreshed' } },
      { action: 'page_view', characterId: CHARACTERS.late, timestamp: RANGE.to },
      { action: 'page_view', characterId: CHARACTERS.early, timestamp: at(PREVIOUS.from, -1) },
    ];
    await harness.db.insert(usageLogs).values([
      ...pageViews(RANGE.from),
      ...pageViews(PREVIOUS.from).slice(40),
      { action: 'page_view', timestamp: PREVIOUS.from, metadata: { path: '/edge', referrer: 'edge.example' } },
      { action: 'page_view', timestamp: at(RANGE.from, -0.25), metadata: { path: '/edge', is_entry: 'true' } },
      { action: 'page_view', timestamp: at(PREVIOUS.from, -0.25), metadata: { path: '/before' } },
      { action: 'page_view', timestamp: RANGE.to, metadata: { path: '/after' } },
      ...audience,
    ]);
  });

  it('matches the daily counts, totals and source split of each period', async () => {
    const stats = await getPageViewStats(RANGE, PREVIOUS);
    for (const [days, range] of [
      [stats.current, RANGE],
      [stats.previous!, PREVIOUS],
    ] as const) {
      expect(days.map(({ day, views }) => ({ day, views }))).toEqual(await oracle(ORACLE.daily, range));
      const [totals] = await oracle<{ views: number; entries: number; referrals: number; direct: number }>(ORACLE.totals, range);
      expect(pageViewTotals(days)).toEqual({ views: totals!.views, entries: totals!.entries, referrals: totals!.referrals });
      expect(pageViewSources(days)).toEqual({ referred: totals!.referrals, direct: totals!.direct });
      expect(totals!.referrals).toBeGreaterThan(0);
      expect(totals!.direct).toBeGreaterThan(0);
    }
    expect(stats.current.length).toBeGreaterThan(3);
    expect(stats.previous!.length).toBeGreaterThan(1);
  });

  it('reads only the range when no previous period is asked for', async () => {
    const stats = await getPageViewStats(RANGE, null);
    expect(stats.previous).toBeNull();
    expect(stats.current).toEqual((await getPageViewStats(RANGE, PREVIOUS)).current);
  });

  it('refuses a previous period that does not end where the range starts', async () => {
    await expect(getPageViewStats(RANGE, { from: PREVIOUS.from, to: at(RANGE.from, -1) })).rejects.toThrow(
      'The previous period must end where the range starts.',
    );
  });

  it('matches the top pages, entry pages and referrers', async () => {
    const rankings = await getPageViewRankings(RANGE, 10);
    const pages = await oracle<{ value: string; count: number }>(ORACLE.top('path', ''), RANGE);
    const entries = await oracle<{ value: string; count: number }>(ORACLE.top('path', `and metadata ->> 'is_entry' = 'true'`), RANGE);
    const referrers = await oracle<{ value: string; count: number }>(
      ORACLE.top('referrer', `and lower(metadata ->> 'referrer') <> 'login.eveonline.com'`),
      RANGE,
    );
    expect(rankings.topPages).toEqual(pages.map(({ value, count }) => ({ path: value, count })));
    expect(rankings.topEntryPages).toEqual(entries.map(({ value, count }) => ({ path: value, count })));
    expect(rankings.topReferrers).toEqual(referrers.map(({ value, count }) => ({ host: value, count })));
    for (const list of [rankings.topPages, rankings.topEntryPages, rankings.topReferrers]) expect(list).toHaveLength(10);
    await expect(getPageViewRankings(RANGE, 3)).resolves.toEqual({
      topPages: rankings.topPages.slice(0, 3),
      topEntryPages: rankings.topEntryPages.slice(0, 3),
      topReferrers: rankings.topReferrers.slice(0, 3),
    });
  });

  it('matches new and returning users for each period', async () => {
    const audience = await getReturningVsNew(RANGE, PREVIOUS);
    const [current] = await oracle(ORACLE.audience, RANGE);
    const [previous] = await oracle(ORACLE.audience, PREVIOUS);
    expect(audience).toEqual({ current, previous });
    expect(audience.current).toEqual({ newUsers: 1, returning: 2 });
    expect(audience.previous).toEqual({ newUsers: 1, returning: 1 });
    await expect(getReturningVsNew(RANGE, null)).resolves.toEqual({ current, previous: null });
  });
});

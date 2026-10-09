import type { DateRange, ReturningVsNew, SearchVsDirect } from './types';

// Page-view figures derived from one read per period pair, so the activity
// chart, the totals behind the top lists, and the source split all come
// from the same scan.

/** Page views recorded on one UTC day. */
export interface PageViewDay {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  views: number;
  /** Views that started a session. */
  entries: number;
  /** Views with an external referrer, EVE SSO bounces left out. */
  referrals: number;
}

export interface PageViewStats {
  current: PageViewDay[];
  /** Null when no previous period was asked for. */
  previous: PageViewDay[] | null;
}

/** One grouped row: a UTC day within the range or the period before it. */
export interface PageViewPeriodRow extends PageViewDay {
  current: boolean;
}

export interface PeriodPair<T> {
  current: T;
  previous: T | null;
}

/**
 * The previous period must end where the range starts, so one scan from
 * the previous start to the range end covers both and a row's period is
 * just which side of the range start it falls on.
 */
export function readWindow(range: DateRange, previous: DateRange | null): DateRange {
  if (previous === null) return range;
  if (previous.to.getTime() !== range.from.getTime()) {
    throw new Error('The previous period must end where the range starts.');
  }
  return { from: previous.from, to: range.to };
}

function byDay(a: PageViewDay, b: PageViewDay): number {
  if (a.day === b.day) return 0;
  return a.day < b.day ? -1 : 1;
}

function pageViewDay(row: PageViewPeriodRow): PageViewDay {
  return {
    day: row.day,
    views: Number(row.views),
    entries: Number(row.entries),
    referrals: Number(row.referrals),
  };
}

export function splitPageViewPeriods(
  rows: readonly PageViewPeriodRow[],
  hasPrevious: boolean,
): PageViewStats {
  const period = (current: boolean) =>
    rows.filter((row) => row.current === current).map(pageViewDay).sort(byDay);
  return { current: period(true), previous: hasPrevious ? period(false) : null };
}

export function pageViewTotals(days: readonly PageViewDay[]): Omit<PageViewDay, 'day'> {
  return days.reduce(
    (totals, day) => ({
      views: totals.views + day.views,
      entries: totals.entries + day.entries,
      referrals: totals.referrals + day.referrals,
    }),
    { views: 0, entries: 0, referrals: 0 },
  );
}

/** Referred views against the rest, which arrived with no usable referrer. */
export function pageViewSources(days: readonly PageViewDay[]): SearchVsDirect {
  const { views, referrals } = pageViewTotals(days);
  return { referred: referrals, direct: views - referrals };
}

export interface AudienceCounts {
  newUsers: number;
  returning: number;
  previousNew: number;
  previousReturning: number;
}

export function splitAudience(
  row: AudienceCounts | undefined,
  hasPrevious: boolean,
): PeriodPair<ReturningVsNew> {
  const current = { newUsers: Number(row?.newUsers ?? 0), returning: Number(row?.returning ?? 0) };
  if (!hasPrevious) return { current, previous: null };
  return {
    current,
    previous: { newUsers: Number(row?.previousNew ?? 0), returning: Number(row?.previousReturning ?? 0) },
  };
}

export type RankedList = 'pages' | 'entries' | 'referrers';

export interface RankedRow {
  list: RankedList;
  value: string;
  count: number;
}

export interface PageViewRankings {
  topPages: { path: string; count: number }[];
  topEntryPages: { path: string; count: number }[];
  topReferrers: { host: string; count: number }[];
}

/** Splits the ranked rows, already in rank order, into the three top lists. */
export function splitRankings(rows: readonly RankedRow[]): PageViewRankings {
  const list = (name: RankedList) =>
    rows.filter((row) => row.list === name).map((row) => ({ value: row.value, count: Number(row.count) }));
  return {
    topPages: list('pages').map(({ value, count }) => ({ path: value, count })),
    topEntryPages: list('entries').map(({ value, count }) => ({ path: value, count })),
    topReferrers: list('referrers').map(({ value, count }) => ({ host: value, count })),
  };
}

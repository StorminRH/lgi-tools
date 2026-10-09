import { computeDelta, type Delta } from '@/composition/admin-period';
import { formatQuantity } from '@/lib/format/number';
import { SECTION_LOAD_FAILED } from './load-section';
import type { Loaded } from './signals';

export interface MetricRow {
  label: string;
  value: string;
  /** A per-day average, or why the figure is missing. */
  note?: string;
  delta: Delta | null;
}

/** Search Console totals over Google's own report days, which lag the range. */
export interface SearchTotals {
  current: { clicks: number; impressions: number };
  previous: { clicks: number; impressions: number } | null;
  rangeDays: number;
}

function perDay(total: number, rangeDays: number): string | undefined {
  if (rangeDays <= 0) return undefined;
  const v = total / rangeDays;
  return `${v < 10 ? v.toFixed(1) : formatQuantity(v)} / day`;
}

function searchRow(label: string, key: 'clicks' | 'impressions', search: Loaded<SearchTotals | null>): MetricRow {
  // Search Console is its own source: when its read fails, only its figures say so.
  if (search === SECTION_LOAD_FAILED) return { label, value: '—', note: 'unavailable', delta: null };
  if (search === null) return { label, value: '—', delta: null };
  return {
    label,
    value: formatQuantity(search.current[key]),
    note: perDay(search.current[key], search.rangeDays),
    delta: computeDelta(search.current[key], search.previous?.[key] ?? null),
  };
}

export function buildMetricRows(args: {
  rangeDays: number;
  pageViews: { referred: number; direct: number };
  users: { newUsers: number; returning: number };
  prevPageViews: { referred: number; direct: number } | null;
  prevUsers: { newUsers: number; returning: number } | null;
  /** Null when Search Console is not connected or has not reported a day yet. */
  search: Loaded<SearchTotals | null>;
}): MetricRow[] {
  const { rangeDays, pageViews, users, prevPageViews, prevUsers, search } = args;

  const viewsTotal = pageViews.referred + pageViews.direct;
  const usersTotal = users.newUsers + users.returning;

  return [
    {
      label: 'Page views',
      value: formatQuantity(viewsTotal),
      note: perDay(viewsTotal, rangeDays),
      delta: computeDelta(
        viewsTotal,
        prevPageViews ? prevPageViews.referred + prevPageViews.direct : null,
      ),
    },
    {
      label: 'Active users',
      value: formatQuantity(usersTotal),
      delta: computeDelta(usersTotal, prevUsers ? prevUsers.newUsers + prevUsers.returning : null),
    },
    searchRow('Search clicks', 'clicks', search),
    searchRow('Search impressions', 'impressions', search),
  ];
}

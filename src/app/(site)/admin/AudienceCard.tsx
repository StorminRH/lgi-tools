import { previousRange, type RangeKey } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import { getLatestReportDate, getSearchTotals } from '@/data/gsc/queries';
import { pageViewSources } from '@/data/telemetry/page-view-stats';
import { getReturningVsNew } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { DAY_MS } from '@/lib/iso-date';
import { ActivityChart } from './ActivityChart';
import { deriveActivityView, rangeDayCount } from './activity-view';
import { CardLink } from './CardLink';
import { loadDeployMarkers } from './deploy-markers';
import { KpiGrid } from './KpiGrid';
import { loadSection } from './load-section';
import { buildMetricRows, type SearchTotals } from './metric-view';
import { searchPeriods } from './search/search-period';
import { getPageViewStatsShared } from './shared-reads';

// Google reports whole days and lags the range, so search is compared on its
// own latest report day: the only read that has to wait for another.
async function loadSearchTotals(rangeKey: RangeKey): Promise<SearchTotals | null> {
  if (!isGscConfigured()) return null;
  const latestDay = await getLatestReportDate();
  if (latestDay === null) return null;
  const periods = searchPeriods(rangeKey, latestDay);
  const [current, previous] = await Promise.all([
    getSearchTotals(periods.range),
    periods.previous === null ? null : getSearchTotals(periods.previous),
  ]);
  const rangeDays = Math.round((periods.range.to.getTime() - periods.range.from.getTime()) / DAY_MS) + 1;
  return { current, previous, rangeDays };
}

/**
 * Traffic and search for the overview. The usage reads start at once; a
 * failed Search Console read marks only the two search figures.
 */
export async function loadAudience(rangeKey: RangeKey, range: DateRange) {
  const prev = previousRange(rangeKey, range);
  const [views, users, markers, search] = await Promise.all([
    getPageViewStatsShared(range, prev),
    getReturningVsNew(range, prev),
    loadDeployMarkers(),
    loadSection('audience.search', () => loadSearchTotals(rangeKey)),
  ]);
  return {
    rows: buildMetricRows({
      rangeDays: rangeDayCount(range),
      pageViews: pageViewSources(views.current),
      users: users.current,
      prevPageViews: views.previous === null ? null : pageViewSources(views.previous),
      prevUsers: users.previous,
      search,
    }),
    activity: deriveActivityView({ range, dailyCounts: views.current, prevDailyCounts: views.previous, markers }),
  };
}

export function AudienceLinks() {
  return (
    <span className="flex items-center gap-3">
      <CardLink href="/admin/traffic">Traffic</CardLink>
      <CardLink href="/admin/search">Search</CardLink>
    </span>
  );
}

export function AudienceBody({ audience }: { audience: Awaited<ReturnType<typeof loadAudience>> }) {
  return (
    <>
      <KpiGrid rows={audience.rows} />
      <div className="border-t border-border-soft">
        <ActivityChart activity={audience.activity} />
      </div>
    </>
  );
}

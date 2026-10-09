import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { previousRange, type RangeKey } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import { getLatestReportDate, getSearchTotals } from '@/data/gsc/queries';
import { pageViewSources } from '@/data/telemetry/page-view-stats';
import { getReturningVsNew } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { ActivityChart } from './ActivityChart';
import { deriveActivityView, rangeDayCount } from './activity-view';
import { CardLink } from './CardLink';
import { loadDeployMarkers } from './deploy-markers';
import { KpiGrid } from './KpiGrid';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { buildMetricRows } from './metric-view';
import { searchPeriods } from './search/search-period';
import { SectionUnavailable } from './SectionUnavailable';
import { getPageViewStatsShared } from './shared-reads';

function maybe<T>(cond: boolean, thunk: () => Promise<T>): Promise<T | null> {
  return cond ? thunk() : Promise.resolve(null);
}

export async function AudienceCard({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  const prev = previousRange(rangeKey, range);
  const gsc = isGscConfigured();

  const fetched = await loadSection('audience', async () => {
    const latestDay = gsc ? await getLatestReportDate() : null;
    const periods = searchPeriods(rangeKey, latestDay ?? range.to.toISOString().slice(0, 10));
    const values = await Promise.all([
      getPageViewStatsShared(range, prev),
      getReturningVsNew(range, prev),
      maybe(gsc && latestDay !== null, () => getSearchTotals(periods.range)),
      maybe(gsc && latestDay !== null && periods.previous !== null, () => getSearchTotals(periods.previous!)),
      loadDeployMarkers(),
    ]);
    return { values, gscRangeDays: Math.round((periods.range.to.getTime() - periods.range.from.getTime()) / 86_400_000) + 1 };
  });
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Audience" />;

  const [views, users, gscTotals, prevGscTotals, markers] = fetched.values;
  const rows = buildMetricRows({
    rangeDays: rangeDayCount(range),
    gscRangeDays: fetched.gscRangeDays,
    pageViews: pageViewSources(views.current),
    users: users.current,
    gscTotals,
    prevPageViews: views.previous === null ? null : pageViewSources(views.previous),
    prevUsers: users.previous,
    prevGscTotals,
  });
  const activity = deriveActivityView({ range, dailyCounts: views.current, prevDailyCounts: views.previous, markers });

  return (
    <Card data-admin-audience>
      <SectionHeader
        size="md"
        label="Audience"
        hint={
          <span className="flex items-center gap-3">
            <CardLink href="/admin/traffic">Traffic</CardLink>
            <CardLink href="/admin/search">Search</CardLink>
          </span>
        }
      />
      <KpiGrid rows={rows} />
      <div className="border-t border-border-soft">
        <ActivityChart activity={activity} />
      </div>
    </Card>
  );
}

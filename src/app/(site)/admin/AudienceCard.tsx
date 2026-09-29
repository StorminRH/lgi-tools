import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { previousRange, type RangeKey } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import { getLatestReportDate, getSearchTotals } from '@/data/gsc/queries';
import { getDailyCounts, getReturningVsNew, getSearchVsDirect } from '@/data/telemetry/queries';
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

function maybe<T>(cond: boolean, thunk: () => Promise<T>): Promise<T | null> {
  return cond ? thunk() : Promise.resolve(null);
}

export async function AudienceCard({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  const prev = previousRange(rangeKey, range);
  const gsc = isGscConfigured();
  const hasPrev = prev != null;

  const fetched = await loadSection('audience', async () => {
    const latestDay = gsc ? await getLatestReportDate() : null;
    const periods = searchPeriods(rangeKey, latestDay ?? range.to.toISOString().slice(0, 10));
    const values = await Promise.all([
      getSearchVsDirect(range),
      getReturningVsNew(range),
      maybe(gsc && latestDay !== null, () => getSearchTotals(periods.range)),
      maybe(hasPrev, () => getSearchVsDirect(prev!)),
      maybe(hasPrev, () => getReturningVsNew(prev!)),
      maybe(gsc && latestDay !== null && periods.previous !== null, () => getSearchTotals(periods.previous!)),
      getDailyCounts(range),
      maybe(hasPrev, () => getDailyCounts(prev!)),
      loadDeployMarkers(),
    ]);
    return { values, gscRangeDays: Math.round((periods.range.to.getTime() - periods.range.from.getTime()) / 86_400_000) + 1 };
  });
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Audience" />;

  const [
    pageViews,
    users,
    gscTotals,
    prevPageViews,
    prevUsers,
    prevGscTotals,
    dailyCounts,
    prevDailyCounts,
    markers,
  ] = fetched.values;
  const rows = buildMetricRows({
    rangeDays: rangeDayCount(range),
    gscRangeDays: fetched.gscRangeDays,
    pageViews,
    users,
    gscTotals,
    prevPageViews,
    prevUsers,
    prevGscTotals,
  });
  const activity = deriveActivityView({ range, dailyCounts, prevDailyCounts, markers });

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

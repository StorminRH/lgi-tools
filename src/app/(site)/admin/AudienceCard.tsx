import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { previousRange, type RangeKey } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import { getSearchTotals } from '@/data/gsc/queries';
import { getDailyCounts, getReturningVsNew, getSearchVsDirect } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { ActivityChart } from './ActivityChart';
import { deriveActivityView, rangeDayCount } from './activity-view';
import { CardLink } from './CardLink';
import { loadDeployMarkers } from './deploy-markers';
import { KpiGrid } from './KpiGrid';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { buildMetricRows, metricsHint } from './metric-view';
import { SectionUnavailable } from './SectionUnavailable';

function maybe<T>(cond: boolean, thunk: () => Promise<T>): Promise<T | null> {
  return cond ? thunk() : Promise.resolve(null);
}

export async function AudienceCard({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  const prev = previousRange(rangeKey, range);
  const gsc = isGscConfigured();
  const hasPrev = prev != null;

  const fetched = await loadSection('audience', () =>
    Promise.all([
      getSearchVsDirect(range),
      getReturningVsNew(range),
      maybe(gsc, () => getSearchTotals(range)),
      maybe(hasPrev, () => getSearchVsDirect(prev!)),
      maybe(hasPrev, () => getReturningVsNew(prev!)),
      maybe(gsc && hasPrev, () => getSearchTotals(prev!)),
      getDailyCounts(range),
      maybe(hasPrev, () => getDailyCounts(prev!)),
      loadDeployMarkers(),
    ]),
  );
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
  ] = fetched;
  const rows = buildMetricRows({
    rangeDays: rangeDayCount(range),
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
            <span className="hidden sm:inline">{metricsHint(rangeKey)}</span>
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

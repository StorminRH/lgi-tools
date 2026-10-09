import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { StackedShareBar, type ShareSegment } from '@/components/ui/stacked-share-bar';
import { loginFrequencyBuckets } from '@/data/telemetry/health-metrics';
import { pageViewSources, pageViewTotals } from '@/data/telemetry/page-view-stats';
import { getLoginCountsPerUser, getReturningVsNew } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { formatCount } from '@/lib/format/number';
import { deriveActivityView } from '../activity-view';
import { loadDeployMarkers } from '../deploy-markers';
import { getPageViewRankingsShared, getPageViewStatsShared } from '../shared-reads';
import { deriveTrafficView } from '../traffic-view';

// Every traffic card reads the page-view days for the range and the period
// before it through the same shared read, so the page scans them once.

export async function loadTrafficActivity(range: DateRange, previous: DateRange | null) {
  const [views, markers] = await Promise.all([getPageViewStatsShared(range, previous), loadDeployMarkers()]);
  return deriveActivityView({ range, dailyCounts: views.current, prevDailyCounts: views.previous, markers });
}

/** The three ranked lists and the totals their shares are taken of. */
export async function loadTrafficRankings(range: DateRange, previous: DateRange | null) {
  const [rankings, views] = await Promise.all([
    getPageViewRankingsShared(range),
    getPageViewStatsShared(range, previous),
  ]);
  return { lists: deriveTrafficView(rankings), totals: pageViewTotals(views.current) };
}

export async function loadVisitors(range: DateRange, previous: DateRange | null) {
  const [loginCounts, audience, views] = await Promise.all([
    getLoginCountsPerUser(range),
    getReturningVsNew(range, null),
    getPageViewStatsShared(range, previous),
  ]);
  return {
    sources: pageViewSources(views.current),
    returningVsNew: audience.current,
    signedIn: loginCounts.length,
    buckets: loginFrequencyBuckets(loginCounts),
  };
}

function ShareBlock({
  label,
  segments,
  ariaLabel,
  empty,
}: {
  label: string;
  segments: ShareSegment[];
  ariaLabel: string;
  empty: string;
}) {
  // The bar draws nothing when every segment is zero, so say so instead.
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div>
      <SectionHeader variant="sub" label={label} className="mb-2" />
      {total === 0 ? (
        <EmptyState inset>{empty}</EmptyState>
      ) : (
        <StackedShareBar segments={segments} ariaLabel={ariaLabel} />
      )}
    </div>
  );
}

export function VisitorsBody({ visitors }: { visitors: Awaited<ReturnType<typeof loadVisitors>> }) {
  const { sources, returningVsNew, signedIn, buckets } = visitors;
  return (
    <div className="grid grid-cols-1 divide-y divide-border-soft md:grid-cols-2 md:divide-x md:divide-y-0">
      <div className="flex flex-col gap-4 px-3.5 py-3">
        <ShareBlock
          label="Page-view sources"
          segments={[
            { label: 'Referred', value: sources.referred, tone: 'blue' },
            { label: 'Unattributed', value: sources.direct, tone: 'neutral' },
          ]}
          ariaLabel="Referred versus unattributed page views"
          empty="No page views in this range."
        />
        <ShareBlock
          label="New vs returning users"
          segments={[
            { label: 'New', value: returningVsNew.newUsers, tone: 'blue' },
            { label: 'Returning', value: returningVsNew.returning, tone: 'neutral' },
          ]}
          ariaLabel="New versus returning active users"
          empty="No active users in this range."
        />
      </div>
      <div className="pb-1">
        <SectionHeader variant="sub" label="Users by sign-in count" className="px-3.5 py-2" />
        {signedIn === 0 ? (
          <EmptyState>No sign-ins in this range.</EmptyState>
        ) : (
          <DistributionBars
            rows={buckets.map((bucket) => ({ key: bucket.label, label: bucket.label, count: bucket.users }))}
            formatCount={(users) => formatCount(users, 'user')}
            sort="none"
            ariaLabel="Users by sign-in count"
          />
        )}
      </div>
    </div>
  );
}

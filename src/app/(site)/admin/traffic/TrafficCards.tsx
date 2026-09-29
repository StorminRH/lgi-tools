import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { StackedShareBar } from '@/components/ui/stacked-share-bar';
import { previousRange, type RangeKey } from '@/composition/admin-period';
import { loginFrequencyBuckets } from '@/data/telemetry/health-metrics';
import {
  getDailyCounts,
  getTrafficTotals,
  getLoginCountsPerUser,
  getReturningVsNew,
  getSearchVsDirect,
  getTopEntryPages,
  getTopPages,
  getTopReferrers,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { ActivityChart } from '../ActivityChart';
import { deriveActivityView } from '../activity-view';
import { CardLink } from '../CardLink';
import { loadDeployMarkers } from '../deploy-markers';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { SectionUnavailable } from '../SectionUnavailable';
import { deriveTrafficView, type BarRows } from '../traffic-view';

function BarList({ data, empty, ariaLabel, total }: { data: BarRows; empty: string; ariaLabel: string; total: number }) {
  if (data.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <DistributionBars rows={data} ariaLabel={ariaLabel} total={total} />;
}

function ListCard({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('h-full', className)}>
      <SectionHeader size="md" label={label} hint={hint} />
      {children}
    </Card>
  );
}

function pluralUsers(n: number): string {
  return `${n.toLocaleString()} user${n === 1 ? '' : 's'}`;
}

export async function ActivityCard({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  const prev = previousRange(rangeKey, range);
  const fetched = await loadSection('traffic-activity', () =>
    Promise.all([
      getDailyCounts(range),
      prev ? getDailyCounts(prev) : Promise.resolve(null),
      loadDeployMarkers(),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Activity" />;
  const [dailyCounts, prevDailyCounts, markers] = fetched;
  return (
    <Card>
      <SectionHeader size="md" label="Activity" />
      <ActivityChart activity={deriveActivityView({ range, dailyCounts, prevDailyCounts, markers })} />
    </Card>
  );
}

export async function TrafficLists({ range }: { range: DateRange }) {
  const fetched = await loadSection('traffic-lists', () =>
    Promise.all([
      getTopPages(range, 10),
      getTopReferrers(range, 10),
      getTopEntryPages(range, 10),
      getTrafficTotals(range),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Traffic" />;
  const [topPages, topReferrers, topEntryPages, totals] = fetched;
  const view = deriveTrafficView({ topPages, topReferrers, topEntryPages });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ListCard label="Top pages" className="lg:col-span-2">
        <BarList total={totals.pageViews} data={view.topPages} empty="No page-view events in this range." ariaLabel="Top pages by views" />
      </ListCard>
      <ListCard label="Entry pages">
        <BarList
          total={totals.entries}
          data={view.topEntryPages}
          empty="No session entry events in this range."
          ariaLabel="Top entry pages by sessions"
        />
      </ListCard>
      <ListCard label="Referrers" hint={<CardLink href="/admin/search">Search console</CardLink>}>
        <BarList
          total={totals.referrals}
          data={view.topReferrers}
          empty="No external referrers in this range."
          ariaLabel="Top referrers by page views"
        />
      </ListCard>
    </div>
  );
}

export async function PilotsCard({ range }: { range: DateRange }) {
  const fetched = await loadSection('pilots', () =>
    Promise.all([getLoginCountsPerUser(range), getReturningVsNew(range), getSearchVsDirect(range)]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Visitors & users" />;
  const [loginCounts, returningVsNew, searchVsDirect] = fetched;
  const buckets = loginFrequencyBuckets(loginCounts);
  return (
    <Card>
      <SectionHeader
        size="md"
        label="Visitors & users"
        hint={<CardLink href="/settings/access">Users &amp; roles</CardLink>}
      />
      <div className="grid grid-cols-1 divide-y divide-border-soft md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="flex flex-col gap-4 px-3.5 py-3">
          <div>
            <SectionHeader variant="sub" label="Page-view sources" className="mb-2" />
            <StackedShareBar
              segments={[
                { label: 'Referred', value: searchVsDirect.referred, tone: 'blue' },
                { label: 'Unattributed', value: searchVsDirect.direct, tone: 'neutral' },
              ]}
              ariaLabel="Referred versus unattributed page views"
            />
          </div>
          <div>
            <SectionHeader variant="sub" label="New vs returning users" className="mb-2" />
            <StackedShareBar
              segments={[
                { label: 'New', value: returningVsNew.newUsers, tone: 'blue' },
                { label: 'Returning', value: returningVsNew.returning, tone: 'neutral' },
              ]}
              ariaLabel="New versus returning active users"
            />
          </div>
        </div>
        <div className="pb-1">
          <SectionHeader variant="sub" label="Users by sign-in count" className="px-3.5 py-2" />
          {loginCounts.length === 0 ? (
            <EmptyState>No sign-ins in this range.</EmptyState>
          ) : (
            <DistributionBars
              rows={buckets.map((b) => ({ key: b.label, label: b.label, count: b.users }))}
              formatCount={pluralUsers}
              sort="none"
              ariaLabel="Users by sign-in count"
            />
          )}
        </div>
      </div>
    </Card>
  );
}

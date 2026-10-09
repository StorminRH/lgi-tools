import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { parseRange, previousRange, rangeFor } from '@/composition/admin-period';
import { ActivityChart } from '../ActivityChart';
import { AdminPageFrame } from '../AdminFrame';
import { AdminSection } from '../AdminSection';
import { CardLink } from '../CardLink';
import type { RangeSearchParams } from '../RangeControl';
import { loadTrafficActivity, loadTrafficRankings, loadVisitors, VisitorsBody } from './TrafficCards';

// Three cards over one rankings read: each list and the total its shares are of.
const RANKINGS = [
  {
    title: 'Top pages',
    name: 'top-pages',
    list: 'topPages',
    total: 'views',
    empty: 'No page-view events in this range.',
    ariaLabel: 'Top pages by views',
    wide: true,
    hint: undefined,
  },
  {
    title: 'Entry pages',
    name: 'entry-pages',
    list: 'topEntryPages',
    total: 'entries',
    empty: 'No session entry events in this range.',
    ariaLabel: 'Top entry pages by sessions',
    wide: false,
    hint: undefined,
  },
  {
    title: 'Referrers',
    name: 'referrers',
    list: 'topReferrers',
    total: 'referrals',
    empty: 'No external referrers in this range.',
    ariaLabel: 'Top referrers by page views',
    wide: false,
    hint: <CardLink href="/admin/search">Search console</CardLink>,
  },
] as const;

async function TrafficContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  const range = rangeFor(rangeKey);
  const previous = previousRange(rangeKey, range);
  return (
    <>
      <AdminSection
        title="Activity"
        name="traffic-activity"
        rows={4}
        reveal={1}
        load={() => loadTrafficActivity(range, previous)}
      >
        {(activity) => <ActivityChart activity={activity} />}
      </AdminSection>
      {/* Cards keep their own heights: a short list does not stretch to a long one. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {RANKINGS.map((ranking) => (
          <AdminSection
            key={ranking.name}
            title={ranking.title}
            name={ranking.name}
            hint={ranking.hint}
            rows={ranking.wide ? 8 : 5}
            reveal={2}
            slotClassName={ranking.wide ? 'lg:col-span-2' : undefined}
            load={() => loadTrafficRankings(range, previous)}
          >
            {({ lists, totals }) =>
              lists[ranking.list].length === 0 ? (
                <EmptyState>{ranking.empty}</EmptyState>
              ) : (
                <DistributionBars rows={lists[ranking.list]} total={totals[ranking.total]} ariaLabel={ranking.ariaLabel} />
              )
            }
          </AdminSection>
        ))}
      </div>
      <AdminSection
        title="Visitors & users"
        name="visitors"
        rows={4}
        reveal={3}
        hint={<CardLink href="/admin/users">Users &amp; roles</CardLink>}
        load={() => loadVisitors(range, previous)}
      >
        {(visitors) => <VisitorsBody visitors={visitors} />}
      </AdminSection>
    </>
  );
}

export default function AdminTrafficPage({ searchParams }: { searchParams: RangeSearchParams }) {
  return (
    <AdminPageFrame
      title="Traffic"
      rangeBasePath="/admin/traffic"
      fallbackLabel="Activity"
    >
      <TrafficContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}

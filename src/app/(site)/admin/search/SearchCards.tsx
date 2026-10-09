import { EmptyState } from '@/components/ui/empty-state';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { ReadoutList, ReadoutRow } from '@/components/ui/readout';
import type { RangeKey } from '@/composition/admin-period';
import { getTopGscPages, getTopQueries } from '@/data/gsc/queries';
import type { GscSitemapStatus } from '@/data/gsc/types';
import type { DateRange } from '@/data/telemetry/types';
import { formatQuantity } from '@/lib/format/number';
import { formatIsoDay } from '@/lib/format/time';
import { AdminCard } from '../AdminSection';
import { AdminTrendChart } from '../charts';
import { DeltaBadge } from '../DeltaBadge';
import { deriveGscMultiples } from '../gsc-multiples-view';
import { getLatestReportDateShared, getSearchTrendShared } from '../shared-reads';
import { searchPeriods } from './search-period';
import { deriveGscPerformanceView, searchSpan, sitemapNote, splitSearchPeriods } from './search-view';

const TREND_UNITS = ['count', 'count', 'position'] as const;

const TERM_READS = { queries: getTopQueries, pages: getTopGscPages };

// Google reports whole days with a lag, so the dated cards count back from
// the newest reported day. Each card waits on that request-cached read in its
// own load, so a failure blanks only the cards that need it.
async function periodsFor(rangeKey: RangeKey) {
  const latestDay = await getLatestReportDateShared();
  return searchPeriods(rangeKey, latestDay ?? formatIsoDay(new Date()));
}

// Performance and the term cards share one daily read covering both periods.
async function readSearchPeriods(range: DateRange, previous: DateRange | null) {
  return splitSearchPeriods(await getSearchTrendShared(searchSpan(range, previous)), range, previous);
}

export async function loadSearchPerformance(rangeKey: RangeKey) {
  const { range, previous } = await periodsFor(rangeKey);
  return readSearchPeriods(range, previous);
}

/** The top ten queries or landing pages, and the clicks their shares are of. */
export async function loadSearchTerms(kind: keyof typeof TERM_READS, rangeKey: RangeKey) {
  const { range, previous } = await periodsFor(rangeKey);
  const [terms, periods] = await Promise.all([TERM_READS[kind](range, 10), readSearchPeriods(range, previous)]);
  return { terms, clicks: periods.totals.clicks };
}

export function SearchNotConnected() {
  return (
    <AdminCard title="Search Console" name="search-console">
      <EmptyState kind="disconnected">Search Console not connected.</EmptyState>
    </AdminCard>
  );
}

export function PerformanceBody({ performance }: { performance: Awaited<ReturnType<typeof loadSearchPerformance>> }) {
  const { trend, totals, prevTotals } = performance;
  const view = deriveGscPerformanceView(trend);
  if (!view.hasTrend) return <EmptyState>No Search Console data synced yet for this range.</EmptyState>;
  const trends = [view.clicksTrend, view.impressionsTrend, view.positionTrend] as const;
  return (
    <MultiplesGrid>
      {deriveGscMultiples({ totals, prevTotals }).map((cell, i) => (
        <MultiplesCell
          key={cell.title}
          title={cell.title}
          value={cell.value}
          note={cell.note}
          delta={cell.delta ? <DeltaBadge delta={cell.delta} invert={cell.invert} /> : undefined}
        >
          <AdminTrendChart
            points={trends[i]!.points}
            labels={trends[i]!.labels}
            unit={TREND_UNITS[i]!}
            height={112}
            ariaLabel={`${cell.title} by day`}
          />
        </MultiplesCell>
      ))}
    </MultiplesGrid>
  );
}

export function SitemapList({ sitemaps }: { sitemaps: GscSitemapStatus[] }) {
  if (sitemaps.length === 0) return <EmptyState>No sitemap data synced yet.</EmptyState>;
  return (
    <ReadoutList>
      {sitemaps.map((sitemap) => (
        <ReadoutRow
          key={sitemap.path}
          label={sitemap.path}
          value={`${formatQuantity(sitemap.submitted)} submitted`}
          note={sitemapNote(sitemap)}
        />
      ))}
    </ReadoutList>
  );
}

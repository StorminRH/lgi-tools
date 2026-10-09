import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { getSitemapStatus, getTopGscPages, getTopQueries } from '@/data/gsc/queries';
import type { GscSitemapStatus, GscTermStat } from '@/data/gsc/types';
import type { DateRange } from '@/data/telemetry/types';
import { formatIsoDay } from '@/lib/format/time';
import { AdminTrendChart } from '../charts';
import { DeltaBadge } from '../DeltaBadge';
import { deriveGscMultiples } from '../gsc-multiples-view';
import { getSearchTrendShared } from '../shared-reads';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { SectionUnavailable } from '../SectionUnavailable';
import { deriveGscPerformanceView, searchSpan, splitSearchPeriods } from './search-view';

const TREND_UNITS = ['count', 'count', 'position'] as const;

// Performance and the term cards share one daily read covering both periods.
async function readSearchPeriods(range: DateRange, previous: DateRange | null) {
  return splitSearchPeriods(await getSearchTrendShared(searchSpan(range, previous)), range, previous);
}

function GscTermRow({ term, max, total }: { term: GscTermStat; max: number; total: number }) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((term.clicks / max) * 100));
  const share = total > 0 ? Math.round((term.clicks / total) * 100) : null;
  return (
    <li className="border-b border-border-soft px-3.5 py-2 last:border-b-0">
      <div className="mb-1 flex items-center justify-between">
        <span className="break-all font-data text-ui text-text">{term.key}</span>
        <span className="ml-3 shrink-0 font-data text-ui tabular-nums text-muted">
          {term.clicks.toLocaleString()} clk{share === null ? '' : ` · ${share}%`}
        </span>
      </div>
      <ProgressBar pct={pct} />
      <div className="mt-1 font-data text-micro tabular-nums text-muted">
        {term.impressions.toLocaleString()} impr · {(term.ctr * 100).toFixed(1)}% CTR · pos{' '}
        {term.position.toFixed(1)}
      </div>
    </li>
  );
}

function TermList({ terms, total, empty }: { terms: GscTermStat[]; total: number; empty: string }) {
  if (terms.length === 0) return <EmptyState>{empty}</EmptyState>;
  const max = terms.reduce((m, term) => Math.max(m, term.clicks), 0);
  return (
    <ul>
      {terms.map((term) => (
        <GscTermRow key={term.key} term={term} max={max} total={total} />
      ))}
    </ul>
  );
}

export function SearchNotConnected() {
  return (
    <Card>
      <SectionHeader size="md" label="Search Console" />
      <EmptyState>
        Search Console not connected.
      </EmptyState>
    </Card>
  );
}

export async function PerformanceCard({ range, previous }: { range: DateRange; previous: DateRange | null }) {
  const fetched = await loadSection('search-performance', () => readSearchPeriods(range, previous));
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Search performance" />;
  const { trend, totals, prevTotals } = fetched;
  const view = deriveGscPerformanceView(trend);
  const trends = [view.clicksTrend, view.impressionsTrend, view.positionTrend] as const;
  return (
    <Card>
      <SectionHeader size="md" label="Performance" />
      {view.hasTrend ? (
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
      ) : (
        <EmptyState>No Search Console data synced yet for this range.</EmptyState>
      )}
    </Card>
  );
}

export async function TermCards({ range, previous }: { range: DateRange; previous: DateRange | null }) {
  const fetched = await loadSection('search-terms', () =>
    Promise.all([getTopQueries(range, 10), getTopGscPages(range, 10), readSearchPeriods(range, previous)]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Top queries" />;
  const [queries, pages, { totals }] = fetched;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="h-full">
        <SectionHeader size="md" label="Top queries" />
        <TermList terms={queries} total={totals.clicks} empty="No search queries in this range." />
      </Card>
      <Card className="h-full">
        <SectionHeader size="md" label="Top pages in search" />
        <TermList terms={pages} total={totals.clicks} empty="No search-landing pages in this range." />
      </Card>
    </div>
  );
}

function SitemapRow({ sitemap }: { sitemap: GscSitemapStatus }) {
  return (
    <li className="border-b border-border-soft px-3.5 py-2 last:border-b-0">
      <div className="mb-1 flex items-center justify-between">
        <span className="break-all font-data text-ui text-text">{sitemap.path}</span>
        <span className="ml-3 shrink-0 font-data text-ui tabular-nums text-muted">
          {sitemap.submitted.toLocaleString()} URLs submitted
        </span>
      </div>
      <div className="font-data text-micro text-muted">
        {sitemap.errors} errors · {sitemap.warnings} warnings
        {sitemap.lastDownloaded ? ` · downloaded ${formatIsoDay(sitemap.lastDownloaded)}` : ''}
        {sitemap.isPending ? ' · pending' : ''}
      </div>
    </li>
  );
}

export async function SitemapsCard() {
  const fetched = await loadSection('sitemaps', getSitemapStatus);
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Sitemaps" />;
  return (
    <Card>
      <SectionHeader size="md" label="Sitemaps" />
      {fetched.length === 0 ? (
        <EmptyState>No sitemap data synced yet.</EmptyState>
      ) : (
        <ul>
          {fetched.map((sitemap) => (
            <SitemapRow key={sitemap.path} sitemap={sitemap} />
          ))}
        </ul>
      )}
    </Card>
  );
}

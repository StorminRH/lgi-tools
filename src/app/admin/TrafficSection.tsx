import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { Pill, type PillTone } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { StackedShareBar } from '@/components/ui/stacked-share-bar';
import { isGscConfigured } from '@/data/gsc/constants';
import {
  getSearchTotals,
  getSearchTrend,
  getSitemapStatus,
  getTopGscPages,
  getTopQueries,
  getUrlInspection,
} from '@/data/gsc/queries';
import type { GscSitemapStatus, GscTermStat, GscUrlStatus } from '@/data/gsc/types';
import {
  getDailyCounts,
  getSearchVsDirect,
  getTopEntryPages,
  getTopPages,
  getTopReferrers,
  getTopSearches,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { formatIsoDay } from '@/lib/format/time';
import { deriveActivityView, type ActivityChartData } from './activity-view';
import { AdminDailyChart, AdminTrendChart } from './charts';
import { DeltaBadge } from './DeltaBadge';
import { loadDeployMarkers } from './deploy-markers';
import { deriveGscMultiples } from './gsc-multiples-view';
import { getLastSyncedAtShared } from './last-synced';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { previousRange, type RangeKey } from './period';
import { deriveGscPerformanceView, deriveTrafficView, type BarRows } from './traffic-view';
import { SectionUnavailable } from './SectionUnavailable';

// Traffic & SEO: a two-column card grid. The left column is app-owned
// telemetry; the right is the stored Google Search Console snapshot, streaming
// from its own Suspense holes so the external-data reads never gate the rest.
// Every metric appears exactly once — the old Health/SEO tab duplication
// (daily trend, entry pages) collapses to one card each here.

function pctLabel(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function CollapsedDetailHeader({ label }: { label: string }) {
  return (
    <>
      <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span
        data-chevron
        className="text-micro text-muted transition-transform inline-block shrink-0"
      >
        ▾
      </span>
    </>
  );
}

// ── Google Search Console cards ─────────────────────────────────────────

function verdictTone(verdict: string | null): PillTone {
  switch (verdict) {
    case 'PASS':
      return 'green';
    case 'PARTIAL':
      return 'orange';
    case 'FAIL':
      return 'red';
    default:
      return 'neutral';
  }
}

// A top query or page: term + clicks bar (with its share of total clicks) + a
// secondary impressions/CTR/pos line. `max` sizes the fill; `total` prints the
// share so the row is readable at rest.
function GscTermRow({ term, max, total }: { term: GscTermStat; max: number; total: number }) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((term.clicks / max) * 100));
  const share = total === 0 ? 0 : Math.round((term.clicks / total) * 100);
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-ui text-text break-all">{term.key}</span>
        <span className="font-mono text-ui text-muted tabular-nums shrink-0 ml-3">
          {term.clicks.toLocaleString()} clk · {share}%
        </span>
      </div>
      <ProgressBar pct={pct} />
      <div className="mt-1 font-mono text-micro text-muted tabular-nums">
        {term.impressions.toLocaleString()} impr · {(term.ctr * 100).toFixed(1)}% CTR · pos{' '}
        {term.position.toFixed(1)}
      </div>
    </div>
  );
}

function GscSitemapRow({ sitemap }: { sitemap: GscSitemapStatus }) {
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-ui text-text break-all">{sitemap.path}</span>
        <span className="font-mono text-ui text-muted tabular-nums shrink-0 ml-3">
          {sitemap.indexed.toLocaleString()} / {sitemap.submitted.toLocaleString()} indexed
        </span>
      </div>
      <div className="font-mono text-micro text-muted">
        {sitemap.submitted === 0
          ? 'no URLs submitted'
          : `${pctLabel(sitemap.indexed, sitemap.submitted)} coverage`}{' '}
        · {sitemap.errors} errors · {sitemap.warnings} warnings
        {sitemap.lastDownloaded ? ` · crawled ${formatIsoDay(sitemap.lastDownloaded)}` : ''}
        {sitemap.isPending ? ' · pending' : ''}
      </div>
    </div>
  );
}

function GscUrlRow({ url }: { url: GscUrlStatus }) {
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-mono text-ui text-text break-all">{url.url}</span>
        {url.verdict ? <Pill tone={verdictTone(url.verdict)}>{url.verdict}</Pill> : null}
      </div>
      <div className="font-mono text-micro text-muted">
        {url.coverageState ?? 'unknown'}
        {url.lastCrawlTime ? ` · crawled ${formatIsoDay(url.lastCrawlTime)}` : ''}
      </div>
    </div>
  );
}

function GscNotConnectedCard({ label }: { label: string }) {
  return (
    <Card>
      <SectionHeader size="md" label={label} hint="Google Search Console" />
      <EmptyState>
        Not connected — set GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL to sync
        search-visibility data.
      </EmptyState>
    </Card>
  );
}

function GscCardFallback({ label }: { label: string }) {
  return (
    <Card>
      <SectionHeader size="md" label={label} hint="Google Search Console" />
      <LoadingLabel className="block px-3.5 py-6" />
    </Card>
  );
}

// Clicks, impressions, and avg position as three equal small-multiples — every
// metric visible at rest (the old collapsible hid two of the three), each headed
// by its current value + delta. Position's delta inverts (lower is better) and
// its cell is labelled. The search-landing pages, sitemap, and index lists follow
// below, no longer collapsed.
function GscPerformanceDetail({
  view,
  cells,
  topPages,
  totalClicks,
  sitemaps,
  urls,
}: {
  view: ReturnType<typeof deriveGscPerformanceView>;
  cells: ReturnType<typeof deriveGscMultiples>;
  topPages: GscTermStat[];
  // All search clicks in the range (the 'total' dimension) — the honest share
  // denominator, so a row's % is its share of ALL clicks, not the top-10 subtotal.
  totalClicks: number;
  sitemaps: GscSitemapStatus[];
  urls: GscUrlStatus[];
}) {
  const trends = [view.clicksTrend, view.impressionsTrend, view.positionTrend] as const;
  const units = ['count', 'count', 'position'] as const;
  return (
    <>
      <MultiplesGrid>
        {cells.map((cell, i) => (
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
              unit={units[i]!}
              width={224}
              height={112}
              ariaLabel={`${cell.title} by day`}
            />
          </MultiplesCell>
        ))}
      </MultiplesGrid>
      <div className="px-3.5 py-2 text-label tracking-[0.16em] uppercase text-muted border-y border-border-soft">
        Top pages in search
      </div>
      {topPages.length === 0 ? (
        <EmptyState>No search-landing pages in this range.</EmptyState>
      ) : (
        topPages.map((p) => (
          <GscTermRow key={p.key} term={p} max={view.topPagesMax} total={totalClicks} />
        ))
      )}
      <div className="px-3.5 py-2 text-label tracking-[0.16em] uppercase text-muted border-b border-border-soft">
        Indexing &amp; sitemap
      </div>
      {sitemaps.length === 0 ? (
        <EmptyState>No sitemap data synced yet.</EmptyState>
      ) : (
        sitemaps.map((s) => <GscSitemapRow key={s.path} sitemap={s} />)
      )}
      {urls.length > 0 && (
        <>
          <div className="px-3.5 py-2 text-label tracking-[0.16em] uppercase text-muted border-b border-border-soft">
            Page index status
          </div>
          {urls.map((u) => (
            <GscUrlRow key={u.url} url={u} />
          ))}
        </>
      )}
    </>
  );
}

function GscPerformanceCardBody({
  view,
  cells,
  topPages,
  totalClicks,
  sitemaps,
  urls,
}: {
  view: ReturnType<typeof deriveGscPerformanceView>;
  cells: ReturnType<typeof deriveGscMultiples>;
  topPages: GscTermStat[];
  totalClicks: number;
  sitemaps: GscSitemapStatus[];
  urls: GscUrlStatus[];
}) {
  return (
    <Card>
      <SectionHeader size="md" label="Search performance" hint="Google Search Console" />
      <div className="px-3.5 py-2 font-mono text-ui text-muted border-b border-border-soft">
        Google data lags ~2–3 days · last synced {view.asOf}
      </div>
      {view.hasTrend ? (
        <GscPerformanceDetail
          view={view}
          cells={cells}
          topPages={topPages}
          totalClicks={totalClicks}
          sitemaps={sitemaps}
          urls={urls}
        />
      ) : (
        <EmptyState>No Search Console data synced yet for this range.</EmptyState>
      )}
    </Card>
  );
}

// Search performance: all three metrics as small-multiples with deltas, then the
// landing pages / sitemap / index lists — nothing hidden behind a collapsible.
async function GscPerformanceCard({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  if (!isGscConfigured()) return <GscNotConnectedCard label="Search performance" />;

  const prev = previousRange(rangeKey, range);
  const fetched = await loadSection('search-performance', () =>
    Promise.all([
      getLastSyncedAtShared(),
      getSearchTrend(range),
      getTopGscPages(range, 10),
      getSitemapStatus(),
      getUrlInspection(),
      getSearchTotals(range),
      prev ? getSearchTotals(prev) : Promise.resolve(null),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Search performance" />;

  const [lastSyncedAt, trend, topPages, sitemaps, urls, totals, prevTotals] = fetched;
  const view = deriveGscPerformanceView({ lastSyncedAt, trend, topPages });
  const cells = deriveGscMultiples({ totals, prevTotals });

  return (
    <GscPerformanceCardBody
      view={view}
      cells={cells}
      topPages={topPages}
      totalClicks={totals.clicks}
      sitemaps={sitemaps}
      urls={urls}
    />
  );
}

async function GscTopQueriesCard({ range }: { range: DateRange }) {
  if (!isGscConfigured()) return <GscNotConnectedCard label="Top search queries" />;

  const fetched = await loadSection('top-search-queries', () =>
    Promise.all([getTopQueries(range, 10), getSearchTotals(range)]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Top search queries" />;

  const [topQueries, totals] = fetched;
  const max = topQueries.reduce((m, q) => Math.max(m, q.clicks), 0);

  return (
    <Card>
      <SectionHeader size="md" label="Top search queries" hint="Google Search Console" />
      {topQueries.length === 0 ? (
        <EmptyState>No search queries in this range.</EmptyState>
      ) : (
        // Share denominator is ALL search clicks, not the top-10 subtotal.
        topQueries.map((q) => <GscTermRow key={q.key} term={q} max={max} total={totals.clicks} />)
      )}
    </Card>
  );
}

// ── The section ─────────────────────────────────────────────────────────

// A ranked distribution (count + share per row), or an empty-state line.
function BarList({ data, empty, ariaLabel }: { data: BarRows; empty: string; ariaLabel: string }) {
  if (data.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <DistributionBars rows={data} ariaLabel={ariaLabel} />;
}

// Events per day as discrete bars (weekends dimmed) with a 7-day moving-average
// line, a dashed prior-period reference, deploy markers, and an end label — the
// smooth area retired because daily counts have no values between the days.
function ActivityCard({ activity }: { activity: ActivityChartData }) {
  return (
    <Card>
      <SectionHeader size="md" label="Activity" hint="events / day · 7d avg" />
      {!activity.hasData ? (
        <EmptyState>No events in this range.</EmptyState>
      ) : (
        // Fixed-width chart (like the rest of the admin substrate) scrolls inside
        // the card on a narrow viewport instead of overflowing the page.
        <div className="px-3.5 py-3 overflow-x-auto">
          <AdminDailyChart
            points={activity.points}
            average={activity.average}
            labels={activity.labels}
            weekend={activity.weekend}
            referenceLine={activity.referenceLine}
            eventMarkers={activity.eventMarkers}
            endValue={activity.endValue}
            endDelta={activity.endDelta}
            unit="count"
            ariaLabel="Events per day with a 7-day average and prior-period reference"
          />
        </div>
      )}
    </Card>
  );
}

export async function TrafficSection({
  rangeKey,
  range,
}: {
  rangeKey: RangeKey;
  range: DateRange;
}) {
  const prev = previousRange(rangeKey, range);
  // Deploy markers come from the changelog (not the DB) and are best-effort, so
  // load them outside the section's degrade-on-failure guard.
  const markers = await loadDeployMarkers();

  const fetched = await loadSection('traffic', () =>
    Promise.all([
      getDailyCounts(range),
      getTopPages(range, 10),
      getTopReferrers(range, 10),
      getTopEntryPages(range, 10),
      getTopSearches(range, 10),
      getSearchVsDirect(range),
      prev ? getDailyCounts(prev) : Promise.resolve(null),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Traffic & SEO" />;

  const [
    dailyCounts,
    topPages,
    topReferrers,
    topEntryPages,
    topSearches,
    searchVsDirect,
    prevDailyCounts,
  ] = fetched;
  const view = deriveTrafficView({ topPages, topReferrers, topEntryPages, topSearches });
  const activity = deriveActivityView({ range, dailyCounts, prevDailyCounts, markers });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityCard activity={activity} />

        <Suspense fallback={<GscCardFallback label="Search performance" />}>
          <GscPerformanceCard rangeKey={rangeKey} range={range} />
        </Suspense>

        <Card>
          <SectionHeader size="md" label="Top pages" hint={`${topPages.length} paths`} />
          <BarList
            data={view.topPages}
            empty="No page-view events in this range."
            ariaLabel="Top pages by views"
          />
        </Card>

        <Suspense fallback={<GscCardFallback label="Top search queries" />}>
          <GscTopQueriesCard range={range} />
        </Suspense>
      </div>

      <Card>
        <SectionHeader
          size="md"
          label="Acquisition"
          hint="where visitors come from and land"
        />
        {searchVsDirect.referred + searchVsDirect.direct > 0 && (
          <div className="px-3.5 py-3 border-b border-border-soft">
            <div className="text-label tracking-[0.16em] uppercase text-muted mb-2">
              Referred vs direct page views
            </div>
            <StackedShareBar
              segments={[
                { label: 'Referred', value: searchVsDirect.referred, tone: 'blue' },
                { label: 'Direct', value: searchVsDirect.direct, tone: 'neutral' },
              ]}
              ariaLabel="Referred versus direct page views"
            />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border-soft">
          <div className="bg-bg">
            <div className="px-3.5 py-2 text-label tracking-[0.16em] uppercase text-muted border-b border-border-soft">
              Top referrers
            </div>
            <BarList
              data={view.topReferrers}
              empty="No external referrers in this range."
              ariaLabel="Top referrers by page views"
            />
          </div>
          <div className="bg-bg">
            <div className="px-3.5 py-2 text-label tracking-[0.16em] uppercase text-muted border-b border-border-soft">
              Top entry pages
            </div>
            <BarList
              data={view.topEntryPages}
              empty="No session entry events in this range."
              ariaLabel="Top entry pages by sessions"
            />
          </div>
        </div>
        <Collapsible header={<CollapsedDetailHeader label="Product usage · terminal searches" />}>
          <div className="border-t border-border-soft">
            <BarList
              data={view.topSearches}
              empty="No terminal searches in this range."
              ariaLabel="Top terminal searches"
            />
          </div>
        </Collapsible>
      </Card>
    </div>
  );
}

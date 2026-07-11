import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { Pill, type PillTone } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { isGscConfigured } from '@/data/gsc/constants';
import {
  getSearchTrend,
  getSitemapStatus,
  getTopGscPages,
  getTopQueries,
  getUrlInspection,
} from '@/data/gsc/queries';
import type { GscSitemapStatus, GscTermStat, GscUrlStatus } from '@/data/gsc/types';
import {
  getDailyCounts,
  getTopEntryPages,
  getTopPages,
  getTopReferrers,
  getTopSearches,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { formatIsoDay } from '@/lib/format/time';
import { AdminTrendChart } from './charts';
import { getLastSyncedAtShared } from './last-synced';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import {
  deriveGscPerformanceView,
  deriveTrafficView,
  type BarListData,
} from './traffic-view';
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

// Label + count with a proportional fill bar — the list workhorse.
function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((count / max) * 100));
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[12px] text-text break-all">{label}</span>
        <span className="font-mono text-[11px] text-muted tabular-nums shrink-0 ml-3">
          {count.toLocaleString()}
        </span>
      </div>
      <ProgressBar pct={pct} />
    </div>
  );
}

function CollapsedDetailHeader({ label }: { label: string }) {
  return (
    <>
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span
        data-chevron
        className="text-[10px] text-muted transition-transform inline-block shrink-0"
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

// A top query or page: term + clicks bar + a secondary impressions/CTR/pos line.
function GscTermRow({ term, max }: { term: GscTermStat; max: number }) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((term.clicks / max) * 100));
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[12px] text-text break-all">{term.key}</span>
        <span className="font-mono text-[11px] text-muted tabular-nums shrink-0 ml-3">
          {term.clicks.toLocaleString()} clk
        </span>
      </div>
      <ProgressBar pct={pct} />
      <div className="mt-1 font-mono text-[10px] text-muted tabular-nums">
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
        <span className="font-mono text-[12px] text-text break-all">{sitemap.path}</span>
        <span className="font-mono text-[11px] text-muted tabular-nums shrink-0 ml-3">
          {sitemap.indexed.toLocaleString()} / {sitemap.submitted.toLocaleString()} indexed
        </span>
      </div>
      <div className="font-mono text-[10px] text-muted">
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
        <span className="font-mono text-[12px] text-text break-all">{url.url}</span>
        {url.verdict ? <Pill tone={verdictTone(url.verdict)}>{url.verdict}</Pill> : null}
      </div>
      <div className="font-mono text-[10px] text-muted">
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

// The expanded detail behind the "More search detail" collapsible: the
// impressions/position trends and the top-pages, sitemap, and page-index lists.
function GscPerformanceDetail({
  view,
  topPages,
  sitemaps,
  urls,
}: {
  view: ReturnType<typeof deriveGscPerformanceView>;
  topPages: GscTermStat[];
  sitemaps: GscSitemapStatus[];
  urls: GscUrlStatus[];
}) {
  return (
    <>
      <div className="px-3.5 py-3">
        <div className="text-[10px] tracking-[0.16em] uppercase text-muted mb-2">Clicks / day</div>
        <AdminTrendChart
          points={view.clicksTrend.points}
          labels={view.clicksTrend.labels}
          unit="count"
          ariaLabel="Search clicks by day"
        />
      </div>
      <Collapsible header={<CollapsedDetailHeader label="More search detail" />}>
        <div className="border-t border-border-soft">
          <div className="px-3.5 py-3">
            <div className="text-[10px] tracking-[0.16em] uppercase text-muted mb-2">
              Impressions / day
            </div>
            <AdminTrendChart
              points={view.impressionsTrend.points}
              labels={view.impressionsTrend.labels}
              unit="count"
              ariaLabel="Search impressions by day"
            />
          </div>
          <div className="px-3.5 py-3">
            <div className="text-[10px] tracking-[0.16em] uppercase text-muted mb-2">
              Avg position / day (lower is better)
            </div>
            <AdminTrendChart
              points={view.positionTrend.points}
              labels={view.positionTrend.labels}
              unit="position"
              ariaLabel="Average search position by day"
            />
          </div>
          <div className="px-3.5 py-2 text-[10px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
            Top pages in search
          </div>
          {topPages.length === 0 ? (
            <EmptyState>No search-landing pages in this range.</EmptyState>
          ) : (
            topPages.map((p) => <GscTermRow key={p.key} term={p} max={view.topPagesMax} />)
          )}
          <div className="px-3.5 py-2 text-[10px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
            Indexing &amp; sitemap
          </div>
          {sitemaps.length === 0 ? (
            <EmptyState>No sitemap data synced yet.</EmptyState>
          ) : (
            sitemaps.map((s) => <GscSitemapRow key={s.path} sitemap={s} />)
          )}
          {urls.length > 0 && (
            <>
              <div className="px-3.5 py-2 text-[10px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
                Page index status
              </div>
              {urls.map((u) => (
                <GscUrlRow key={u.url} url={u} />
              ))}
            </>
          )}
        </div>
      </Collapsible>
    </>
  );
}

function GscPerformanceCardBody({
  view,
  topPages,
  sitemaps,
  urls,
}: {
  view: ReturnType<typeof deriveGscPerformanceView>;
  topPages: GscTermStat[];
  sitemaps: GscSitemapStatus[];
  urls: GscUrlStatus[];
}) {
  return (
    <Card>
      <SectionHeader size="md" label="Search performance" hint="Google Search Console" />
      <div className="px-3.5 py-2 font-mono text-[11px] text-muted border-b border-border-soft">
        Google data lags ~2–3 days · last synced {view.asOf}
      </div>
      {view.hasTrend ? (
        <GscPerformanceDetail view={view} topPages={topPages} sitemaps={sitemaps} urls={urls} />
      ) : (
        <EmptyState>No Search Console data synced yet for this range.</EmptyState>
      )}
    </Card>
  );
}

// Search performance: the clicks trend is the visible headline; impressions,
// position, search-landing pages, and indexing state sit behind one
// collapsed detail so the default view stays scannable.
async function GscPerformanceCard({ range }: { range: DateRange }) {
  if (!isGscConfigured()) return <GscNotConnectedCard label="Search performance" />;

  const fetched = await loadSection('search-performance', () =>
    Promise.all([
      getLastSyncedAtShared(),
      getSearchTrend(range),
      getTopGscPages(range, 10),
      getSitemapStatus(),
      getUrlInspection(),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Search performance" />;

  const [lastSyncedAt, trend, topPages, sitemaps, urls] = fetched;
  const view = deriveGscPerformanceView({ lastSyncedAt, trend, topPages });

  return <GscPerformanceCardBody view={view} topPages={topPages} sitemaps={sitemaps} urls={urls} />;
}

async function GscTopQueriesCard({ range }: { range: DateRange }) {
  if (!isGscConfigured()) return <GscNotConnectedCard label="Top search queries" />;

  const topQueries = await loadSection('top-search-queries', () => getTopQueries(range, 10));
  if (topQueries === SECTION_LOAD_FAILED) return <SectionUnavailable label="Top search queries" />;

  const max = topQueries.reduce((m, q) => Math.max(m, q.clicks), 0);

  return (
    <Card>
      <SectionHeader size="md" label="Top search queries" hint="Google Search Console" />
      {topQueries.length === 0 ? (
        <EmptyState>No search queries in this range.</EmptyState>
      ) : (
        topQueries.map((q) => <GscTermRow key={q.key} term={q} max={max} />)
      )}
    </Card>
  );
}

// ── The section ─────────────────────────────────────────────────────────

// A ranked bar list, or an empty-state line when there are no rows.
function BarList({ data, empty }: { data: BarListData; empty: string }) {
  if (data.rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <>
      {data.rows.map((row) => (
        <BarRow key={row.key} label={row.label} count={row.count} max={data.max} />
      ))}
    </>
  );
}

function ActivityCard({
  dailyCounts,
  trend,
}: {
  dailyCounts: { day: string; totalEvents: number }[];
  trend: ReturnType<typeof deriveTrafficView>['dailyTrend'];
}) {
  return (
    <Card>
      <SectionHeader size="md" label="Activity" hint={`${dailyCounts.length} days with events`} />
      {dailyCounts.length === 0 ? (
        <EmptyState>No events in this range.</EmptyState>
      ) : (
        <div className="px-3.5 py-3">
          <div className="text-[10px] tracking-[0.16em] uppercase text-muted mb-2">Events / day</div>
          <AdminTrendChart
            points={trend.points}
            labels={trend.labels}
            unit="count"
            ariaLabel="Daily events"
          />
        </div>
      )}
    </Card>
  );
}

export async function TrafficSection({ range }: { range: DateRange }) {
  const fetched = await loadSection('traffic', () =>
    Promise.all([
      getDailyCounts(range),
      getTopPages(range, 10),
      getTopReferrers(range, 10),
      getTopEntryPages(range, 10),
      getTopSearches(range, 10),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Traffic & SEO" />;

  const [dailyCounts, topPages, topReferrers, topEntryPages, topSearches] = fetched;
  const view = deriveTrafficView({
    dailyCounts,
    topPages,
    topReferrers,
    topEntryPages,
    topSearches,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityCard dailyCounts={dailyCounts} trend={view.dailyTrend} />

        <Suspense fallback={<GscCardFallback label="Search performance" />}>
          <GscPerformanceCard range={range} />
        </Suspense>

        <Card>
          <SectionHeader size="md" label="Top pages" hint={`${topPages.length} paths`} />
          <BarList data={view.topPages} empty="No page-view events in this range." />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border-soft">
          <div className="bg-bg">
            <div className="px-3.5 py-2 text-[10px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
              Top referrers
            </div>
            <BarList data={view.topReferrers} empty="No external referrers in this range." />
          </div>
          <div className="bg-bg">
            <div className="px-3.5 py-2 text-[10px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
              Top entry pages
            </div>
            <BarList data={view.topEntryPages} empty="No session entry events in this range." />
          </div>
        </div>
        <Collapsible header={<CollapsedDetailHeader label="Product usage · terminal searches" />}>
          <div className="border-t border-border-soft">
            <BarList data={view.topSearches} empty="No terminal searches in this range." />
          </div>
        </Collapsible>
      </Card>
    </div>
  );
}

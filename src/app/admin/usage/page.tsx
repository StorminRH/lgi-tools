import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill, type PillTone } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import {
  getGscStatus,
  getSearchTotals,
  getSearchTrend,
  getSitemapStatus,
  getTopPages as getGscTopPages,
  getTopQueries,
  getUrlInspection,
} from '@/data/gsc/queries';
import type { GscSitemapStatus, GscTermStat, GscUrlStatus } from '@/data/gsc/types';
import {
  budgetSummary,
  cronHealthSummary,
  degradationCallerSummary,
  fallbackSummary,
  formatPct,
  loginFrequencyBuckets,
  ratio,
  refreshVolumeSummary,
  returningVsNewSummary,
  searchVsDirectSummary,
  summarizeCronHealth,
} from '@/data/telemetry/health-metrics';
import {
  getAggregateSummary,
  getBudgetExhaustionCount,
  getDailyCounts,
  getDegradationByCaller,
  getFallbackRate,
  getLoginCountsPerUser,
  getPriceCronOutcomes,
  getRefreshVolume,
  getReturningVsNew,
  getRoleChangeAudit,
  getSdeCronOutcomes,
  getSearchVsDirect,
  getSitesViewSplit,
  getTopEntryPages,
  getTopPages,
  getTopReferrers,
  getTopSearches,
  getTopUtmSources,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { getSession, isAdmin } from '@/features/auth/session';
import { BarChart, TrendChart } from './charts';
import { PrintButton } from './PrintButton';

const RANGES = ['7d', '30d', '90d', 'all'] as const;
type RangeKey = (typeof RANGES)[number];

const TABS = ['health', 'seo', 'users'] as const;
type TabKey = (typeof TABS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  health: 'Health',
  seo: 'SEO',
  users: 'Users',
};

// Date floor for `all` is set to a year before the first user is plausibly
// active; in practice the table only goes back to 2.8.4's deploy day.
const ALL_TIME_FROM = new Date('2025-01-01T00:00:00Z');

function rangeFor(key: RangeKey, now: Date = new Date()): DateRange {
  if (key === 'all') return { from: ALL_TIME_FROM, to: now };
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

// Both selectors build hrefs from the *current* tab + range so switching one
// preserves the other (a bare `?range=` would wipe the active tab).
function ControlBar({ tab, range }: { tab: TabKey; range: RangeKey }) {
  const linkBase =
    'font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border transition-colors';
  const active = 'border-[#2a3550] text-isk bg-[#0a101a]';
  const idle = 'border-[#1e2c3a] text-muted hover:text-text hover:border-[#2a3550]';
  return (
    <div className="no-print flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {TABS.map((t) => (
          <a
            key={t}
            href={`/admin/usage?tab=${t}&range=${range}`}
            className={`${linkBase} ${t === tab ? active : idle}`}
          >
            {TAB_LABEL[t]}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {RANGES.map((r) => (
          <a
            key={r}
            href={`/admin/usage?tab=${tab}&range=${r}`}
            className={`${linkBase} ${r === range ? active : idle}`}
          >
            {r === 'all' ? 'All' : r}
          </a>
        ))}
      </div>
    </div>
  );
}

function MetricHeadline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-1 px-4 py-3 border border-border bg-bg">
      <div className="font-display font-bold text-[28px] leading-none text-name tabular-nums">
        {value}
      </div>
      <div className="text-[9px] tracking-[0.16em] uppercase text-muted">{label}</div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return <MetricHeadline label={label} value={value.toLocaleString()} />;
}

function SummaryLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-2 text-[11px] font-mono text-muted border-b border-border-soft">
      {children}
    </div>
  );
}

function HorizontalBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((count / max) * 100));
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[11px] text-text break-all">{label}</span>
        <span className="font-mono text-[10px] text-muted tabular-nums shrink-0 ml-3">
          {count.toLocaleString()}
        </span>
      </div>
      <ProgressBar pct={pct} />
    </div>
  );
}

function pctLabel(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function parseRange(raw: string | string[] | undefined): RangeKey {
  if (typeof raw !== 'string') return '30d';
  return (RANGES as readonly string[]).includes(raw) ? (raw as RangeKey) : '30d';
}

function parseTab(raw: string | string[] | undefined): TabKey {
  if (typeof raw !== 'string') return 'health';
  return (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : 'health';
}

// A day-indexed series → serializable trend props (x = ordinal index; the day
// strings, in ascending query order, label each point). The formatters live in
// <TrendChart> client-side, so only these plain arrays cross to the chart.
function trendSeries(days: string[], values: number[]) {
  return { points: values.map((y, x) => ({ x, y })), labels: days };
}

// ── Health tab ──────────────────────────────────────────────────────────

async function HealthTab({ range }: { range: DateRange }) {
  const [
    summary,
    fallback,
    budgetExhaustions,
    degradationByCaller,
    priceOutcomes,
    sdeOutcomes,
    refreshVolume,
    dailyCounts,
    topEntryPages,
  ] = await Promise.all([
    getAggregateSummary(range),
    getFallbackRate(range),
    getBudgetExhaustionCount(range),
    getDegradationByCaller(range),
    getPriceCronOutcomes(range),
    getSdeCronOutcomes(range),
    getRefreshVolume(range),
    getDailyCounts(range),
    getTopEntryPages(range, 10),
  ]);

  const fallbackRate = ratio(fallback.fallback, fallback.esi + fallback.fallback);
  const fallbackTrend = trendSeries(
    fallback.perDay.map((p) => p.day),
    fallback.perDay.map((p) =>
      p.esi + p.fallback === 0 ? 0 : Math.round((p.fallback / (p.esi + p.fallback)) * 100),
    ),
  );
  const volumeTrend = trendSeries(
    refreshVolume.map((p) => p.day),
    refreshVolume.map((p) => p.fetched),
  );
  const cronHealth = summarizeCronHealth(priceOutcomes, sdeOutcomes);
  const allOutcomes = [
    ...priceOutcomes.map((o) => ({ label: `prices·${o.outcome}`, value: o.count })),
    ...sdeOutcomes.map((o) => ({ label: `sde·${o.outcome}`, value: o.count })),
  ];
  const entriesTotal = topEntryPages.reduce((s, r) => s + r.count, 0);
  const topEntryMax = topEntryPages.reduce((m, r) => Math.max(m, r.count), 0);
  const dailyEntriesTrend = trendSeries(
    dailyCounts.map((d) => d.day),
    dailyCounts.map((d) => d.totalEvents),
  );

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6">
      <Card>
        <SectionHeader label="Summary" />
        <div className="px-3.5 py-3 grid grid-cols-3 gap-2">
          <StatBlock label="Total events" value={summary.totalEvents} />
          <StatBlock label="Unique characters" value={summary.uniqueCharacters} />
          <StatBlock label="Anonymous events" value={summary.anonymousEvents} />
        </div>
      </Card>

      <Card>
        <SectionHeader label="ESI source health" hint="ESI vs Fuzzwork fallback" />
        <SummaryLine>{fallbackSummary(fallback)}</SummaryLine>
        <div className="px-3.5 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <MetricHeadline label="Fallback rate" value={formatPct(fallbackRate)} />
          <MetricHeadline label="Budget-exhaustion events" value={String(budgetExhaustions)} />
        </div>
        <SummaryLine>{budgetSummary(budgetExhaustions)}</SummaryLine>
        {fallback.perDay.length > 0 && (
          <div className="px-3.5 pb-3">
            <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
              Fallback rate by day
            </div>
            <TrendChart
              points={fallbackTrend.points}
              labels={fallbackTrend.labels}
              unit="percent"
              tone="orange"
              ariaLabel="Fallback rate by day"
            />
          </div>
        )}
        <div className="px-3.5 pb-3">
          <SummaryLine>{degradationCallerSummary(degradationByCaller)}</SummaryLine>
          {degradationByCaller.length > 0 && (
            <div className="pt-3">
              <BarChart
                data={degradationByCaller.map((d) => ({ label: d.caller, value: d.count }))}
                tone="red"
                ariaLabel="Degradation events by caller"
              />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader label="Live-pricing" hint="refresh volume + outcomes" />
        <SummaryLine>{refreshVolumeSummary(refreshVolume)}</SummaryLine>
        <div className="px-3.5 py-3 flex flex-col gap-4">
          {refreshVolume.length > 0 ? (
            <div>
              <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
                Rows fetched by day
              </div>
              <TrendChart
                points={volumeTrend.points}
                labels={volumeTrend.labels}
                unit="count"
                tone="blue"
                ariaLabel="Rows fetched by day"
              />
            </div>
          ) : (
            <EmptyState>No price refreshes in this range.</EmptyState>
          )}
          {priceOutcomes.length > 0 && (
            <div>
              <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
                Fetch outcomes
              </div>
              <BarChart
                data={priceOutcomes.map((o) => ({ label: o.outcome, value: o.count }))}
                tone="teal"
                ariaLabel="Price-cron fetch outcomes"
              />
            </div>
          )}
          <div className="text-[10px] font-mono text-muted">
            Short-term cache-hit ratio is not measured here — coalesced live-price hits skip the
            logging path, so the true ratio lives in the platform edge cache, out of scope.
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader label="Cron health" hint="nightly prices + weekly SDE" />
        <SummaryLine>{cronHealthSummary(cronHealth)}</SummaryLine>
        <div className="px-3.5 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <MetricHeadline label="Cron health" value={formatPct(cronHealth.ratio)} />
          <MetricHeadline label="Lock-skipped runs" value={String(cronHealth.neutral)} />
        </div>
        {allOutcomes.length > 0 ? (
          <div className="px-3.5 pb-3">
            <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
              Runs by outcome
            </div>
            <BarChart
              data={allOutcomes}
              tone="green"
              width={Math.max(320, allOutcomes.length * 70)}
              ariaLabel="Cron runs by outcome"
            />
          </div>
        ) : (
          <EmptyState>No cron runs recorded in this range.</EmptyState>
        )}
        {(priceOutcomes.length > 0 || sdeOutcomes.length > 0) && (
          <div className="px-3.5 pb-3">
            <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-1">
              Average duration by outcome
            </div>
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {[...priceOutcomes, ...sdeOutcomes].map((o, i) => (
                  <tr key={`${o.outcome}-${i}`} className="border-t border-border-soft">
                    <td className="py-1 text-text">
                      {i < priceOutcomes.length ? 'prices' : 'sde'} · {o.outcome}
                    </td>
                    <td className="py-1 text-right text-muted tabular-nums">
                      {o.avgDurationMs.toLocaleString()} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader label="Acquisition" hint={`${entriesTotal.toLocaleString()} entries`} />
        {dailyCounts.length > 0 && (
          <div className="px-3.5 py-3">
            <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
              Daily events
            </div>
            <TrendChart
              points={dailyEntriesTrend.points}
              labels={dailyEntriesTrend.labels}
              unit="count"
              tone="green"
              ariaLabel="Daily events"
            />
          </div>
        )}
        {topEntryPages.length === 0 ? (
          <EmptyState>No session entry events in this range.</EmptyState>
        ) : (
          topEntryPages.map((row) => (
            <HorizontalBar key={row.path} label={row.path} count={row.count} max={topEntryMax} />
          ))
        )}
      </Card>
    </div>
  );
}

// ── Google Search Console (3.3.3) ───────────────────────────────────────
// Search-visibility data Google owns, pulled by the daily cron into our own
// tables and read here from the stored snapshot only (zero Google calls on
// load). Tone leans blue/teal/purple to set it apart from the app-owned
// green/orange telemetry.

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
        <span className="font-mono text-[11px] text-text break-all">{term.key}</span>
        <span className="font-mono text-[10px] text-muted tabular-nums shrink-0 ml-3">
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
        <span className="font-mono text-[11px] text-text break-all">{sitemap.path}</span>
        <span className="font-mono text-[10px] text-muted tabular-nums shrink-0 ml-3">
          {sitemap.indexed.toLocaleString()} / {sitemap.submitted.toLocaleString()} indexed
        </span>
      </div>
      <div className="font-mono text-[10px] text-muted">
        {sitemap.submitted === 0
          ? 'no URLs submitted'
          : `${pctLabel(sitemap.indexed, sitemap.submitted)} coverage`}{' '}
        · {sitemap.errors} errors · {sitemap.warnings} warnings
        {sitemap.lastDownloaded ? ` · crawled ${formatDate(sitemap.lastDownloaded)}` : ''}
        {sitemap.isPending ? ' · pending' : ''}
      </div>
    </div>
  );
}

function GscUrlRow({ url }: { url: GscUrlStatus }) {
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-mono text-[11px] text-text break-all">{url.url}</span>
        {url.verdict ? <Pill tone={verdictTone(url.verdict)}>{url.verdict}</Pill> : null}
      </div>
      <div className="font-mono text-[10px] text-muted">
        {url.coverageState ?? 'unknown'}
        {url.lastCrawlTime ? ` · crawled ${formatDate(url.lastCrawlTime)}` : ''}
      </div>
    </div>
  );
}

// The search-visibility half of the SEO tab. Reads only the stored GSC
// snapshot; renders a "not connected" note when the sync isn't configured.
async function GscSearchConsoleSection({ range }: { range: DateRange }) {
  const status = await getGscStatus();
  if (!status.configured) {
    return (
      <Card>
        <SectionHeader label="Google Search Console" hint="search visibility" />
        <EmptyState>
          Google Search Console not connected — set GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL to sync
          search-visibility data.
        </EmptyState>
      </Card>
    );
  }

  const [totals, trend, topQueries, topPages, sitemaps, urls] = await Promise.all([
    getSearchTotals(range),
    getSearchTrend(range),
    getTopQueries(range, 10),
    getGscTopPages(range, 10),
    getSitemapStatus(),
    getUrlInspection(),
  ]);

  const impressionsTrend = trendSeries(
    trend.map((d) => d.day),
    trend.map((d) => d.impressions),
  );
  const clicksTrend = trendSeries(
    trend.map((d) => d.day),
    trend.map((d) => d.clicks),
  );
  const positionTrend = trendSeries(
    trend.map((d) => d.day),
    trend.map((d) => Math.round(d.position * 10) / 10),
  );
  const topQueriesMax = topQueries.reduce((m, q) => Math.max(m, q.clicks), 0);
  const topPagesMax = topPages.reduce((m, p) => Math.max(m, p.clicks), 0);
  const asOf = status.lastSyncedAt ? `${formatDateTime(status.lastSyncedAt)} UTC` : 'never';

  return (
    <>
      <Card>
        <SectionHeader label="Search performance" hint="Google Search Console" />
        <SummaryLine>Google data lags ~2–3 days · last synced {asOf}</SummaryLine>
        {trend.length === 0 ? (
          <EmptyState>No Search Console data synced yet for this range.</EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-soft">
              <MetricHeadline label="Impressions" value={totals.impressions.toLocaleString()} />
              <MetricHeadline label="Clicks" value={totals.clicks.toLocaleString()} />
              <MetricHeadline label="CTR" value={`${(totals.ctr * 100).toFixed(1)}%`} />
              <MetricHeadline label="Avg position" value={totals.position.toFixed(1)} />
            </div>
            <div className="px-3.5 py-3">
              <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
                Impressions / day
              </div>
              <TrendChart
                points={impressionsTrend.points}
                labels={impressionsTrend.labels}
                unit="count"
                tone="blue"
                ariaLabel="Search impressions by day"
              />
            </div>
            <div className="px-3.5 py-3">
              <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
                Clicks / day
              </div>
              <TrendChart
                points={clicksTrend.points}
                labels={clicksTrend.labels}
                unit="count"
                tone="teal"
                ariaLabel="Search clicks by day"
              />
            </div>
            <div className="px-3.5 py-3">
              <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
                Avg position / day (lower is better)
              </div>
              <TrendChart
                points={positionTrend.points}
                labels={positionTrend.labels}
                unit="position"
                tone="purple"
                ariaLabel="Average search position by day"
              />
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionHeader label="Top search queries" hint={`${topQueries.length} queries`} />
        {topQueries.length === 0 ? (
          <EmptyState>No search queries in this range.</EmptyState>
        ) : (
          topQueries.map((q) => <GscTermRow key={q.key} term={q} max={topQueriesMax} />)
        )}
      </Card>

      <Card>
        <SectionHeader label="Top pages in search" hint={`${topPages.length} pages`} />
        {topPages.length === 0 ? (
          <EmptyState>No search-landing pages in this range.</EmptyState>
        ) : (
          topPages.map((p) => <GscTermRow key={p.key} term={p} max={topPagesMax} />)
        )}
      </Card>

      <Card>
        <SectionHeader label="Indexing & sitemap" hint="coverage" />
        {sitemaps.length === 0 ? (
          <EmptyState>No sitemap data synced yet.</EmptyState>
        ) : (
          sitemaps.map((s) => <GscSitemapRow key={s.path} sitemap={s} />)
        )}
      </Card>

      {urls.length > 0 && (
        <Card>
          <SectionHeader label="Page index status" hint={`${urls.length} pages`} />
          {urls.map((u) => (
            <GscUrlRow key={u.url} url={u} />
          ))}
        </Card>
      )}
    </>
  );
}

// ── SEO tab ─────────────────────────────────────────────────────────────

async function SeoTab({ range }: { range: DateRange }) {
  const [
    topReferrers,
    topUtmSources,
    topEntryPages,
    searchVsDirect,
    topPages,
    viewSplit,
    topSearches,
    dailyCounts,
  ] = await Promise.all([
    getTopReferrers(range, 10),
    getTopUtmSources(range, 10),
    getTopEntryPages(range, 10),
    getSearchVsDirect(range),
    getTopPages(range, 10),
    getSitesViewSplit(range),
    getTopSearches(range, 10),
    getDailyCounts(range),
  ]);

  const topReferrersMax = topReferrers.reduce((m, r) => Math.max(m, r.count), 0);
  const topUtmSourcesMax = topUtmSources.reduce((m, r) => Math.max(m, r.count), 0);
  const topEntryPagesMax = topEntryPages.reduce((m, r) => Math.max(m, r.count), 0);
  const topPagesMax = topPages.reduce((m, r) => Math.max(m, r.count), 0);
  const topSearchesMax = topSearches.reduce((m, r) => Math.max(m, r.count), 0);
  const viewSplitTotal = viewSplit.cards + viewSplit.table;
  const viewSplitMax = Math.max(viewSplit.cards, viewSplit.table);
  const dailyTrend = trendSeries(
    dailyCounts.map((d) => d.day),
    dailyCounts.map((d) => d.totalEvents),
  );

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6">
      <GscSearchConsoleSection range={range} />
      <Card>
        <SectionHeader label="Traffic source" hint="referred vs direct" />
        <SummaryLine>{searchVsDirectSummary(searchVsDirect)}</SummaryLine>
        {searchVsDirect.referred + searchVsDirect.direct > 0 ? (
          <div className="px-3.5 py-3">
            <BarChart
              data={[
                { label: 'Referred', value: searchVsDirect.referred },
                { label: 'Direct', value: searchVsDirect.direct },
              ]}
              tone="blue"
              ariaLabel="Referred vs direct page views"
            />
          </div>
        ) : (
          <EmptyState>No page views in this range.</EmptyState>
        )}
      </Card>

      <Card>
        <SectionHeader
          label="Acquisition"
          hint={`${topReferrers.length + topUtmSources.length + topEntryPages.length} signals`}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-soft">
          <div className="bg-bg">
            <div className="px-3.5 py-2 text-[9px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
              Top referrers
            </div>
            {topReferrers.length === 0 ? (
              <EmptyState>No external referrers in this range.</EmptyState>
            ) : (
              topReferrers.map((row) => (
                <HorizontalBar
                  key={row.host}
                  label={row.host}
                  count={row.count}
                  max={topReferrersMax}
                />
              ))
            )}
          </div>
          <div className="bg-bg">
            <div className="px-3.5 py-2 text-[9px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
              Top UTM sources
            </div>
            {topUtmSources.length === 0 ? (
              <EmptyState>No UTM-tagged traffic in this range.</EmptyState>
            ) : (
              topUtmSources.map((row) => (
                <HorizontalBar
                  key={row.source}
                  label={row.source}
                  count={row.count}
                  max={topUtmSourcesMax}
                />
              ))
            )}
          </div>
          <div className="bg-bg">
            <div className="px-3.5 py-2 text-[9px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
              Top entry pages
            </div>
            {topEntryPages.length === 0 ? (
              <EmptyState>No session entry events in this range.</EmptyState>
            ) : (
              topEntryPages.map((row) => (
                <HorizontalBar
                  key={row.path}
                  label={row.path}
                  count={row.count}
                  max={topEntryPagesMax}
                />
              ))
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader label="Engagement" hint={`${dailyCounts.length} days with events`} />
        {dailyCounts.length === 0 ? (
          <EmptyState>No events in this range.</EmptyState>
        ) : (
          <div className="px-3.5 py-3">
            <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
              Daily events
            </div>
            <TrendChart
              points={dailyTrend.points}
              labels={dailyTrend.labels}
              unit="count"
              tone="green"
              ariaLabel="Daily events"
            />
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader label="Top pages" hint={`${topPages.length} paths`} />
        {topPages.length === 0 ? (
          <EmptyState>No page-view events in this range.</EmptyState>
        ) : (
          topPages.map((row) => (
            <HorizontalBar key={row.path} label={row.path} count={row.count} max={topPagesMax} />
          ))
        )}
      </Card>

      <Card>
        <SectionHeader
          label="Wormhole Sites · view split"
          hint={`${viewSplitTotal.toLocaleString()} total`}
        />
        {viewSplitTotal === 0 ? (
          <EmptyState>No /sites page views in this range.</EmptyState>
        ) : (
          <>
            <HorizontalBar
              label={`Card grid (default) — ${pctLabel(viewSplit.cards, viewSplitTotal)}`}
              count={viewSplit.cards}
              max={viewSplitMax}
            />
            <HorizontalBar
              label={`Table view — ${pctLabel(viewSplit.table, viewSplitTotal)}`}
              count={viewSplit.table}
              max={viewSplitMax}
            />
          </>
        )}
      </Card>

      <Card>
        <SectionHeader label="Top terminal searches" hint={`${topSearches.length} queries`} />
        {topSearches.length === 0 ? (
          <EmptyState>No terminal searches in this range.</EmptyState>
        ) : (
          topSearches.map((row) => (
            <HorizontalBar
              key={row.query}
              label={row.query}
              count={row.count}
              max={topSearchesMax}
            />
          ))
        )}
      </Card>
    </div>
  );
}

// ── Users tab (aggregate-only — counts, never identities) ───────────────

async function UsersTab({ range }: { range: DateRange }) {
  const [returningVsNew, loginCounts, roleAudit] = await Promise.all([
    getReturningVsNew(range),
    getLoginCountsPerUser(range),
    getRoleChangeAudit(range, 50),
  ]);

  const buckets = loginFrequencyBuckets(loginCounts);
  const hasLogins = loginCounts.length > 0;

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6">
      <Card>
        <SectionHeader label="Returning vs new" hint="authenticated sign-ins" />
        <SummaryLine>{returningVsNewSummary(returningVsNew)}</SummaryLine>
        {returningVsNew.newUsers + returningVsNew.returning > 0 ? (
          <div className="px-3.5 py-3">
            <BarChart
              data={[
                { label: 'New', value: returningVsNew.newUsers },
                { label: 'Returning', value: returningVsNew.returning },
              ]}
              tone="purple"
              ariaLabel="Returning vs new users"
            />
          </div>
        ) : (
          <EmptyState>No sign-ins in this range.</EmptyState>
        )}
      </Card>

      <Card>
        <SectionHeader label="Visit frequency" hint="logins per user" />
        {hasLogins ? (
          <div className="px-3.5 py-3">
            <div className="text-[9px] tracking-[0.16em] uppercase text-muted mb-2">
              Users by login count
            </div>
            <BarChart
              data={buckets.map((b) => ({ label: b.label, value: b.users }))}
              tone="teal"
              ariaLabel="Users by login count"
            />
          </div>
        ) : (
          <EmptyState>No sign-ins in this range.</EmptyState>
        )}
      </Card>

      <Card>
        <SectionHeader label="Role change audit" hint={`${roleAudit.length} entries`} />
        {roleAudit.length === 0 ? (
          <EmptyState>No role changes in this range.</EmptyState>
        ) : (
          <div className="px-3.5 py-2">
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="text-[9px] tracking-[0.12em] uppercase text-muted">
                  <th className="text-left py-1.5 font-normal">Timestamp (UTC)</th>
                  <th className="text-left py-1.5 font-normal">Actor</th>
                  <th className="text-left py-1.5 font-normal">Target</th>
                  <th className="text-left py-1.5 font-normal">Change</th>
                </tr>
              </thead>
              <tbody>
                {roleAudit.map((row, idx) => (
                  <tr
                    key={`${row.timestamp.toISOString()}-${idx}`}
                    className="border-t border-border-soft"
                  >
                    <td className="py-1.5 text-text">{formatDateTime(row.timestamp)}</td>
                    <td className="py-1.5 text-text">
                      {row.actorName ?? `id ${row.actorCharacterId ?? '?'}`}
                    </td>
                    <td className="py-1.5 text-text">
                      {row.targetName ?? `id ${row.targetCharacterId ?? '?'}`}
                    </td>
                    <td className="py-1.5">
                      <span className="flex items-center gap-1.5">
                        <Pill tone={row.from === 'ADMIN' ? 'purple' : 'blue'}>
                          {row.from ?? '?'}
                        </Pill>
                        <span className="text-muted">→</span>
                        <Pill tone={row.to === 'ADMIN' ? 'purple' : 'blue'}>{row.to ?? '?'}</Pill>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

async function AdminUsageContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; range?: string | string[] }>;
}) {
  const session = await getSession();
  if (!isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }

  const raw = await searchParams;
  const activeTab = parseTab(raw.tab);
  const activeRange = parseRange(raw.range);
  const range = rangeFor(activeRange);

  return (
    <>
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <div className="print-only font-mono text-[10px] tracking-[0.12em] uppercase text-muted mb-1">
          {TAB_LABEL[activeTab]} report — {formatDate(range.from)} to {formatDate(range.to)}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
              {TAB_LABEL[activeTab]} report
            </div>
            <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
              {formatDate(range.from)} → {formatDate(range.to)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ControlBar tab={activeTab} range={activeRange} />
            <PrintButton />
          </div>
        </div>
      </header>

      {activeTab === 'health' && <HealthTab range={range} />}
      {activeTab === 'seo' && <SeoTab range={range} />}
      {activeTab === 'users' && <UsersTab range={range} />}
    </>
  );
}

function AdminUsageLoading() {
  return <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>;
}

// Per-user, session-gated telemetry: the whole report is a request-time dynamic
// hole. Only the page container prerenders.
export default function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; range?: string | string[] }>;
}) {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <Suspense fallback={<AdminUsageLoading />}>
        <AdminUsageContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

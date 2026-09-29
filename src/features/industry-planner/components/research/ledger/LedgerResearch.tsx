'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Measured } from '@/components/ui/measured';
import { PageTitle } from '@/components/ui/page-head';
import { SectionPanel } from '@/components/ui/readout';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { Switch } from '@/components/ui/switch';
import { eyebrow } from '@/components/ui/type-roles';
import { formatIsk } from '@/lib/format/isk';
import { formatPct } from '@/lib/format/number';
import type { InsightSortKey, ResearchInsight } from '../../../research-insight';
import { confidenceHeadline, factorDetails, formatDays, keyFigures, MOMENTUM_LABEL, signedPct } from '../../../research-insight-view';
import { MeterBar, SERIES } from '../chart-kit';
import { OpportunityMap, Spark, WeekdayBars } from '../MarketCharts';
import { ConfidenceBars, MarginBreakdown, ProfitDistribution } from '../OutlookCharts';
import { PriceChart, VolumeChart } from '../PriceChart';
import {
  AssumptionControls,
  BandPill,
  FIGURE_TONE,
  MethodNotes,
  ProductIcon,
  type ResearchWorkspaceState,
  ScreenedList,
  useResearchWorkspace,
  WatchControls,
} from '../shared';

function TrendCell({ insight }: { insight: ResearchInsight }) {
  const m = insight.momentum;
  if (m === null) return <span className="text-faint">—</span>;
  const arrow = m.direction === 'rising' ? '▲' : m.direction === 'falling' ? '▼' : '■';
  const tone = m.direction === 'falling' ? 'text-dps-mid' : m.direction === 'rising' ? 'text-isk' : 'text-muted';
  return (
    <span className={cn('inline-flex items-baseline gap-1', tone)}>
      <span aria-hidden className="text-micro">{arrow}</span>
      <span className="sr-only">{MOMENTUM_LABEL[m.direction]}</span>
      {signedPct(m.ratio * 100)}
    </span>
  );
}

/** The margin with its P10–P90 spread as a small range bar under it. */
function MarginCell({ insight }: { insight: ResearchInsight }) {
  const band = insight.outlook?.marginPct;
  if (band === undefined) return <span className="text-faint">—</span>;
  const lo = Math.max(-40, band.p10);
  const hi = Math.min(60, band.p90);
  const x = (v: number) => ((Math.max(-40, Math.min(60, v)) + 40) / 100) * 64;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className={band.p50 >= 0 ? 'text-name' : 'text-dps-high'}>{formatPct(band.p50)}</span>
      <svg width={64} height={6} aria-label={`P10 ${formatPct(band.p10)} to P90 ${formatPct(band.p90)}`}>
        <line x1={x(0)} x2={x(0)} y1={0} y2={6} className="stroke-[var(--color-border-active)]" />
        <rect x={x(lo)} y={1.5} width={Math.max(2, x(hi) - x(lo))} height={3} rx={1.5} fill={SERIES.forecast} fillOpacity={0.55} />
        <circle cx={x(band.p50)} cy={3} r={2.5} fill={band.p50 >= 0 ? SERIES.price : SERIES.loss} />
      </svg>
    </span>
  );
}

function ConfidenceCell({ insight }: { insight: ResearchInsight }) {
  const score = insight.confidence.score;
  return (
    <span className="flex min-w-[8.5rem] items-center gap-2">
      <MeterBar value={score ?? 0} color={score === null ? SERIES.muted : score >= 75 ? SERIES.price : score >= 55 ? SERIES.average : score >= 35 ? SERIES.breakeven : SERIES.loss} className="w-16" />
      <BandPill band={insight.band} score={score} />
    </span>
  );
}

function Detail({ insight, state }: { insight: ResearchInsight; state: ResearchWorkspaceState }) {
  const { assumptions } = state;
  return (
    <div className="bg-row-active px-3.5 pb-5 pt-4 font-ui">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={eyebrow({ size: 'micro' })}>Jita · The Forge · 90 days</span>
              <span className="flex items-center gap-3 text-micro">
                <Link href={`/industry/${insight.blueprintTypeId}`} className="text-isk no-underline hover:text-name">
                  Plan this build →
                </Link>
                <Button variant="bare" onClick={() => state.unwatch(insight)} className="cursor-pointer text-muted hover:text-tone-red">
                  Stop watching
                </Button>
              </span>
            </div>
            <Measured>{(width) => <PriceChart insight={insight} width={width} height={230} />}</Measured>
            <Measured>{(width) => <VolumeChart insight={insight} width={width} />}</Measured>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1 sm:grid-cols-4">
              {keyFigures(insight).map((figure) => (
                <div key={figure.id} className="flex flex-col gap-0.5">
                  <dt className={eyebrow({ size: 'micro' })}>{figure.label}</dt>
                  <dd className={cn('font-data text-h3', FIGURE_TONE[figure.tone])}>{figure.value}</dd>
                  <dd className="font-data text-micro text-faint">{figure.note}</dd>
                </div>
              ))}
            </dl>
            <section className="flex flex-col gap-2 pt-2">
              <h3 className={eyebrow({ size: 'micro' })}>Volume by weekday · last 12 weeks</h3>
              <Measured>{(width) => <WeekdayBars index={insight.weekday} width={Math.min(width, 360)} height={80} />}</Measured>
            </section>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h3 className={eyebrow({ size: 'micro' })}>Confidence breakdown</h3>
              <p className="text-ui text-text">{confidenceHeadline(insight)}</p>
              <ConfidenceBars confidence={insight.confidence} details={factorDetails(insight)} />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className={eyebrow({ size: 'micro' })}>Sale price when the batch sells</h3>
              <Measured>{(width) => <ProfitDistribution insight={insight} width={width} />}</Measured>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className={eyebrow({ size: 'micro' })}>Where one unit’s price goes</h3>
              <Measured>
                {(width) => (
                  <MarginBreakdown insight={insight} salesTaxPct={assumptions.salesTaxPct} brokerFeePct={assumptions.brokerFeePct} width={width} />
                )}
              </Measured>
            </section>
          </div>
        </div>
    </div>
  );
}

function SortHeader({ label, sort, state }: { label: string; sort: InsightSortKey; state: ResearchWorkspaceState }) {
  const active = state.sort === sort;
  return (
    <Button
      variant="bare"
      onClick={() => state.setSort(sort)}
      aria-pressed={active}
      className={cn('cursor-pointer uppercase hover:text-text', active && 'text-isk')}
    >
      {label}
      {active ? ' ↓' : ''}
    </Button>
  );
}

function ProductCell({ insight }: { insight: ResearchInsight }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ProductIcon insight={insight} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-ui text-ui text-name">{insight.name}</span>
        {insight.gates.length > 0 && <span className="truncate text-micro text-dps-mid">⚠ {insight.gates[0]?.label}</span>}
      </span>
    </span>
  );
}

function ledgerColumns(state: ResearchWorkspaceState) {
  const fig = (insight: ResearchInsight, value: string) => (state.loading && insight.loading ? '…' : value);
  const rank = new Map(state.visible.map((insight, i) => [insight.blueprintTypeId, i + 1]));
  return [
    { key: 'rank', label: '#', className: 'w-10 text-faint', render: (i) => String(rank.get(i.blueprintTypeId) ?? 0).padStart(2, '0') },
    { key: 'product', label: 'Product', rowHeader: true, render: (i) => <ProductCell insight={i} /> },
    { key: 'spark', label: '30d', render: (i) => <Spark insight={i} width={80} height={24} /> },
    { key: 'ask', label: 'Ask', align: 'right', className: 'tabular-nums text-isk', render: (i) => fig(i, formatIsk(i.sell)) },
    { key: 'volume', label: <SortHeader label="Traded/d" sort="iskVolume" state={state} />, align: 'right', className: 'tabular-nums', render: (i) => fig(i, formatIsk(i.flow?.iskPerDay ?? null)) },
    { key: 'margin', label: <SortHeader label="Margin" sort="margin" state={state} />, align: 'right', className: 'tabular-nums', render: (i) => <MarginCell insight={i} /> },
    { key: 'iskh', label: <SortHeader label="ISK/h" sort="iskPerHour" state={state} />, align: 'right', className: 'tabular-nums', render: (i) => fig(i, formatIsk(i.iskPerHour)) },
    { key: 'sell', label: 'Sell-thru', align: 'right', className: 'tabular-nums', render: (i) => fig(i, formatDays(i.batch?.sellDays ?? null)) },
    { key: 'trend', label: <SortHeader label="Trend" sort="momentum" state={state} />, align: 'right', className: 'tabular-nums', render: (i) => <TrendCell insight={i} /> },
    { key: 'confidence', label: <SortHeader label="Confidence" sort="confidence" state={state} />, render: (i) => <ConfidenceCell insight={i} /> },
  ] satisfies readonly StaticTableColumn<ResearchInsight>[];
}

function LedgerTable({ state }: { state: ResearchWorkspaceState }) {
  const openId = state.selected?.blueprintTypeId ?? null;
  return (
    <div className="overflow-x-auto">
      <StaticTable
        ariaLabel="Watched products"
        columns={ledgerColumns(state)}
        rows={state.visible}
        getRowKey={(insight) => insight.blueprintTypeId}
        className="min-w-[980px] tabular-nums"
        theadClassName="[&_th]:whitespace-nowrap [&_th]:text-micro"
        rowProps={(insight) => ({
          onClick: () => state.select(insight.blueprintTypeId),
          expanded: openId === insight.blueprintTypeId,
          className: cn('transition-colors hover:bg-row-hover', openId === insight.blueprintTypeId && 'bg-row-active'),
        })}
        renderDetail={(insight) => (openId === insight.blueprintTypeId ? <Detail insight={insight} state={state} /> : null)}
      />
    </div>
  );
}

function Tally({ state }: { state: ResearchWorkspaceState }) {
  const pass = state.insights.length - state.screened.length;
  const best = state.insights.find((i) => i.gates.length === 0);
  const topIsk = [...state.insights].sort((a, b) => (b.iskPerHour ?? -Infinity) - (a.iskPerHour ?? -Infinity))[0];
  const items = [
    { label: 'Watching', value: String(state.list.length), note: `${pass} pass screens` },
    { label: 'Top pick', value: best?.name ?? '—', note: best ? `Confidence ${best.confidence.score ?? '—'}` : 'Nothing passes yet' },
    { label: 'Best ISK/h', value: formatIsk(topIsk?.iskPerHour ?? null), note: topIsk?.name ?? '—' },
    { label: 'Batch', value: state.assumptions.batch === 'run' ? '1 run' : state.assumptions.batch === 'slotDay' ? '1 slot-day' : '1 slot-week', note: `${Math.round(state.assumptions.marketShare * 100)}% of daily volume` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5 bg-section px-4 py-3">
          <dt className={eyebrow({ size: 'micro' })}>{item.label}</dt>
          <dd className="truncate font-data text-h3 text-name">{item.value}</dd>
          <dd className="truncate font-data text-micro text-faint">{item.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Ledger: the research landing as a trading terminal. One dense, sortable
 * table carries every product; opening a row lays its charts and the full
 * confidence breakdown out underneath it.
 */
export function LedgerResearch() {
  const state = useResearchWorkspace();
  return (
    <div className="reveal reveal-2 flex flex-col gap-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-xl flex-col gap-1.5">
          <PageTitle size="compact">Market research</PageTitle>
          <p className="text-ui text-muted">
            What to build next: Jita price history, demand and profit odds for every product you watch, scored for how sure the build is to pay.
          </p>
        </div>
        <div className="w-full lg:max-w-md">
          <WatchControls state={state} />
        </div>
      </header>
      <div className={cn(cardSurface, 'flex flex-wrap items-end justify-between gap-4 px-4 py-3')}>
        <AssumptionControls assumptions={state.assumptions} update={state.update} />
        <label className="flex items-center gap-2 font-data text-micro text-muted">
          <Switch checked={state.hideScreened} onCheckedChange={state.setHideScreened} label="Hide screened-out products" />
          Hide screened out ({state.screened.length})
        </label>
      </div>
      {state.ready && state.list.length > 0 && <Tally state={state} />}
      <SectionPanel title="Watchlist" meta={<span className="font-data text-micro text-faint">Click a row for its analysis</span>}>
        {!state.ready ? (
          <EmptyState> </EmptyState>
        ) : state.list.length === 0 ? (
          <EmptyState>Nothing watched yet. Search for a blueprint above to start researching it.</EmptyState>
        ) : (
          <LedgerTable state={state} />
        )}
      </SectionPanel>
      {state.list.length > 0 && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <SectionPanel title="Opportunity map">
            <div className="px-3.5 pb-3.5 pt-2">
              <Measured>{(width) => <OpportunityMap insights={state.insights} width={width} selected={state.selected?.blueprintTypeId ?? null} onSelect={state.select} />}</Measured>
            </div>
          </SectionPanel>
          <SectionPanel title="Screened out">
            <div className="px-3.5 pb-3.5 pt-2">
              <ScreenedList insights={state.screened} onSelect={state.select} />
            </div>
          </SectionPanel>
        </div>
      )}
      <SectionPanel title="How we measure">
        <MethodNotes className="px-3.5 pb-4 pt-2" />
      </SectionPanel>
    </div>
  );
}

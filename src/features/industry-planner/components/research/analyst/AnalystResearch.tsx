'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Measured } from '@/components/ui/measured';
import { PageTitle } from '@/components/ui/page-head';
import { SectionPanel } from '@/components/ui/readout';
import { SegmentedControl } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { eyebrow } from '@/components/ui/type-roles';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatPct } from '@/lib/format/number';
import type { InsightSortKey, ResearchInsight } from '../../../research-insight';
import {
  BAND_LABEL,
  confidenceHeadline,
  factorDetails,
  fillMixText,
  formatDays,
  keyFigures,
  standingText,
  trendText,
  weakestText,
} from '../../../research-insight-view';
import { MeterBar, SERIES } from '../chart-kit';
import { OpportunityMap, WeekdayBars } from '../MarketCharts';
import { ConfidenceBars, ConfidenceDial, ConfidenceWaterfall, MarginBreakdown, ProfitDistribution } from '../OutlookCharts';
import { PriceChart, VolumeChart } from '../PriceChart';
import {
  AssumptionControls,
  FIGURE_TONE,
  MethodNotes,
  ProductIcon,
  type ResearchWorkspaceState,
  ScreenedList,
  SORT_OPTIONS,
  useResearchWorkspace,
  WatchControls,
} from '../shared';

function bandColor(score: number | null): string {
  if (score === null) return SERIES.muted;
  if (score >= 75) return SERIES.price;
  if (score >= 55) return SERIES.average;
  return score >= 35 ? SERIES.breakeven : SERIES.loss;
}

function RailItem({ insight, active, onSelect }: { insight: ResearchInsight; active: boolean; onSelect: () => void }) {
  return (
    <li className="w-[15rem] shrink-0 xl:w-auto">
      <Button
        variant="bare"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'relative flex w-full cursor-pointer flex-col items-stretch gap-1.5 rounded-ctl border px-3 py-2.5 text-left transition-colors',
          active ? 'border-border-active bg-surface-raised' : 'border-transparent hover:bg-row-hover',
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-isk" />}
        <span className="flex min-w-0 items-center gap-2.5">
          <ProductIcon insight={insight} size={24} />
          <span className={cn('min-w-0 flex-1 truncate font-ui text-ui', active ? 'text-name' : 'text-text')}>{insight.name}</span>
          <span className="font-data text-ui tabular-nums text-name">{insight.confidence.score ?? '—'}</span>
        </span>
        <MeterBar value={insight.confidence.score ?? 0} color={bandColor(insight.confidence.score)} />
        <span className="flex justify-between font-data text-micro text-muted">
          <span>{formatPct(insight.outlook?.marginPct.p50 ?? null)} margin</span>
          <span>{formatIsk(insight.iskPerHour)}/h</span>
          {insight.gates.length > 0 && <span className="text-dps-mid">⚠ {insight.gates.length}</span>}
        </span>
      </Button>
    </li>
  );
}

function Rail({ state }: { state: ResearchWorkspaceState }) {
  return (
    <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
      <div className="flex flex-col gap-1.5">
        <PageTitle size="compact">Market research</PageTitle>
        <p className="text-ui text-muted">Research a product before you plan it: price, demand, profit odds and a confidence score you can take apart.</p>
      </div>
      <WatchControls state={state} compact />
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl label="Sort watchlist" density="compact" value={state.sort} onChange={(value) => state.setSort(value as InsightSortKey)} options={SORT_OPTIONS.slice(0, 4)} />
      </div>
      <ul className="-mx-4 flex list-none gap-2 overflow-x-auto px-4 pb-1 xl:mx-0 xl:flex-col xl:gap-1 xl:overflow-visible xl:px-0 xl:pb-0">
        {state.visible.map((insight) => (
          <RailItem
            key={insight.blueprintTypeId}
            insight={insight}
            active={state.selected?.blueprintTypeId === insight.blueprintTypeId}
            onSelect={() => state.select(insight.blueprintTypeId)}
          />
        ))}
      </ul>
      <label className="flex items-center gap-2 font-data text-micro text-muted">
        <Switch checked={state.hideScreened} onCheckedChange={state.setHideScreened} label="Hide screened-out products" />
        Hide screened out ({state.screened.length})
      </label>
      <div className={cn(cardSurface, 'p-3.5')}>
        <span className={cn(eyebrow({ size: 'micro' }), 'mb-2 block')}>Assumptions</span>
        <AssumptionControls assumptions={state.assumptions} update={state.update} />
      </div>
    </aside>
  );
}

function HeroStat({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-section px-4 py-3.5">
      <span className={eyebrow({ size: 'micro' })}>{label}</span>
      {children}
      {note !== undefined && <span className="font-data text-micro text-faint">{note}</span>}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-soft py-2 last:border-b-0">
      <dt className="text-ui text-muted">{label}</dt>
      <dd className="text-right font-data text-ui text-name">
        {value}
        {note !== undefined && <span className="block text-micro text-faint">{note}</span>}
      </dd>
    </div>
  );
}

function Headline({ insight }: { insight: ResearchInsight }) {
  const { outlook } = insight;
  const figures = keyFigures(insight);
  const odds = figures.find((f) => f.id === 'odds');
  const iskh = figures.find((f) => f.id === 'iskh');
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4">
      <HeroStat label="Confidence">
        <div className="flex items-center gap-3">
          <ConfidenceDial score={insight.confidence.score} band={insight.band === null ? null : BAND_LABEL[insight.band]} size={72} />
          <span className="font-data text-micro text-muted">{weakestText(insight)}</span>
        </div>
      </HeroStat>
      <HeroStat label="Expected margin" note={outlook === null ? 'Needs a build cost' : `P10 ${formatPct(outlook.marginPct.p10)} · P90 ${formatPct(outlook.marginPct.p90)}`}>
        <span className={cn('font-data text-stat', FIGURE_TONE[figures[0]?.tone ?? 'plain'])}>{formatPct(outlook?.marginPct.p50 ?? null)}</span>
      </HeroStat>
      <HeroStat label="Profit odds" note={odds?.note}>
        <span className={cn('font-data text-stat', FIGURE_TONE[odds?.tone ?? 'plain'])}>{odds?.value}</span>
      </HeroStat>
      <HeroStat label="ISK / hour" note={iskh?.note}>
        <span className={cn('font-data text-stat', FIGURE_TONE[iskh?.tone ?? 'plain'])}>{iskh?.value}</span>
      </HeroStat>
    </div>
  );
}

function Sheet({ insight, state }: { insight: ResearchInsight; state: ResearchWorkspaceState }) {
  const { flow, batch } = insight;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <ProductIcon insight={insight} size={52} />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate font-display text-h2 font-bold text-name">{insight.name}</h2>
            <span className="flex flex-wrap gap-x-3 font-data text-micro text-muted">
              <span>Ask <span className="text-isk">{formatIsk(insight.sell)}</span></span>
              <span>Bid <span className="text-text">{formatIsk(insight.buy)}</span></span>
              <span>Spread {formatPct(insight.spreadPct)}</span>
              <span>{trendText(insight)}</span>
              <span>{standingText(insight)}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => state.unwatch(insight)}>
            Stop watching
          </Button>
          <Link href={`/industry/${insight.blueprintTypeId}`} className="rounded-ctl bg-brand-gradient px-4 py-2 font-ui text-ui font-semibold text-isk-ink no-underline shadow-cta-glow hover:brightness-110">
            Plan this build →
          </Link>
        </div>
      </header>
      {insight.gates.length > 0 && (
        <Callout label="Screened out">{insight.gates.map((gate) => gate.label).join(' · ')}</Callout>
      )}
      <Headline insight={insight} />
      <SectionPanel title="Price and forecast" meta={<span className="font-data text-micro text-faint">Jita · 90 days · cone to the average sale</span>}>
        <div className="flex flex-col gap-1 px-3.5 pb-3.5 pt-2">
          <Measured>{(width) => <PriceChart insight={insight} width={width} height={300} />}</Measured>
          <Measured>{(width) => <VolumeChart insight={insight} width={width} height={100} />}</Measured>
        </div>
      </SectionPanel>
      <div className="flex flex-col gap-4">
        <SectionPanel title="Confidence, taken apart">
          <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-2">
            <p className="text-ui text-text">{confidenceHeadline(insight)}</p>
            <div className="grid items-center gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Measured>{(width) => <ConfidenceWaterfall confidence={insight.confidence} width={width} height={170} />}</Measured>
              <ConfidenceBars confidence={insight.confidence} details={factorDetails(insight)} />
            </div>
          </div>
        </SectionPanel>
        <SectionPanel title="Profit outlook">
          <div className="grid items-start gap-x-6 gap-y-4 px-3.5 pb-3.5 pt-2 lg:grid-cols-2">
            <Measured>{(width) => <ProfitDistribution insight={insight} width={width} height={150} />}</Measured>
            <div className="flex min-w-0 flex-col gap-4 lg:pt-6">
            <Measured>
              {(width) => <MarginBreakdown insight={insight} salesTaxPct={state.assumptions.salesTaxPct} brokerFeePct={state.assumptions.brokerFeePct} width={width} />}
            </Measured>
            {insight.economics !== null && insight.economics.drivers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className={eyebrow({ size: 'micro' })}>Cost drivers</span>
                {insight.economics.drivers.map((driver) => (
                  <div key={driver.typeId} className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-2 font-data text-micro">
                    <span className="truncate text-text">{driver.name}</span>
                    <MeterBar value={driver.share * 100} color={SERIES.average} />
                    <span className="text-right tabular-nums text-muted">{Math.round(driver.share * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </SectionPanel>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <SectionPanel title="Liquidity">
          <dl className="px-3.5 pb-2">
            <Stat label="Sell-through" value={formatDays(batch?.sellDays ?? null)} note={batch === null ? undefined : `${formatCompactQuantity(batch.units)} units, ${Math.round(state.assumptions.marketShare * 100)}% share`} />
            <Stat label="Slots absorbed" value={insight.svr === null ? '—' : insight.svr.toFixed(1)} />
            <Stat label="Traded / day" value={formatIsk(flow?.iskPerDay ?? null)} note={flow === null ? undefined : `${formatCompactQuantity(flow.adv)} units`} />
            <Stat label="Units per trade" value={flow?.unitsPerOrder == null ? '—' : flow.unitsPerOrder.toFixed(1)} />
            <Stat label="Fill mix" value={insight.sellSide === null ? '—' : `${Math.round(insight.sellSide * 100)}%`} note={fillMixText(insight)} />
          </dl>
        </SectionPanel>
        <SectionPanel title="Price behaviour">
          <dl className="px-3.5 pb-2">
            <Stat label="Daily swing" value={insight.volatility === null ? '—' : `${(insight.volatility * 100).toFixed(1)}%`} />
            <Stat label="30-day trend" value={insight.trend === null ? '—' : formatPct(insight.trend.pctPer30d * 100)} note={insight.trend === null ? undefined : `fit r² ${insight.trend.r2.toFixed(2)}`} />
            <Stat label="Off the peak" value={insight.drawdown === null ? '—' : formatPct(insight.drawdown * 100)} />
            <Stat label="Instant-sell margin" value={formatPct(insight.unit?.instantMarginPct ?? null)} />
            <Stat label="Outlier days clipped" value={formatPct(insight.clippedShare * 100)} />
          </dl>
        </SectionPanel>
        <SectionPanel title="When it trades">
          <div className="px-3.5 pb-3.5 pt-2">
            <Measured>{(width) => <WeekdayBars index={insight.weekday} width={width} height={96} />}</Measured>
            <p className="pt-2 font-data text-micro text-faint">Volume by weekday against an average day, last 12 weeks. Time listings for the busy days.</p>
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}

/**
 * Analyst: the research landing as master and detail. The rail ranks the
 * watchlist; the sheet takes one product apart, from its price and forecast
 * to every factor in its confidence score.
 */
export function AnalystResearch() {
  const state = useResearchWorkspace();
  return (
    <div className="reveal reveal-2 flex flex-col gap-6">
      <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <Rail state={state} />
        {!state.ready ? (
          <EmptyState> </EmptyState>
        ) : state.selected === null ? (
          <EmptyState>Nothing watched yet. Search for a blueprint to start researching it.</EmptyState>
        ) : (
          <Sheet insight={state.selected} state={state} />
        )}
      </div>
      {state.list.length > 0 && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <SectionPanel title="The whole watchlist" meta={<span className="font-data text-micro text-faint">Margin against confidence</span>}>
            <div className="px-3.5 pb-3.5 pt-2">
              <Measured>{(width) => <OpportunityMap insights={state.insights} width={width} height={260} selected={state.selected?.blueprintTypeId ?? null} onSelect={state.select} />}</Measured>
            </div>
          </SectionPanel>
          <div className="flex flex-col gap-4">
            <SectionPanel title="Screened out">
              <div className="px-3.5 pb-3.5 pt-2">
                <ScreenedList insights={state.screened} onSelect={state.select} />
              </div>
            </SectionPanel>
          </div>
        </div>
      )}
      <SectionPanel title="How we measure">
        <MethodNotes className="px-3.5 pb-4 pt-2" />
      </SectionPanel>
    </div>
  );
}

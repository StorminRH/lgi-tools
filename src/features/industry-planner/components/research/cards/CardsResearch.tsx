'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Measured } from '@/components/ui/measured';
import { PageTitle } from '@/components/ui/page-head';
import { SectionPanel } from '@/components/ui/readout';
import { SegmentedControl } from '@/components/ui/segmented';
import { eyebrow } from '@/components/ui/type-roles';
import { CONFIDENCE_FACTOR_LABELS } from '@/data/industry-math/build-confidence';
import { formatIsk } from '@/lib/format/isk';
import type { InsightSortKey, ResearchInsight } from '../../../research-insight';
import { BAND_LABEL, confidenceHeadline, FACTOR_SHORT_LABEL, keyFigures, trendText } from '../../../research-insight-view';
import { MeterBar, SERIES } from '../chart-kit';
import { OpportunityMap, Spark, WeekdayBars } from '../MarketCharts';
import { ConfidenceDial, ConfidenceWaterfall, MarginBreakdown, ProfitDistribution } from '../OutlookCharts';
import { PriceChart, VolumeChart } from '../PriceChart';
import {
  AssumptionControls,
  BandPill,
  FIGURE_TONE,
  MethodNotes,
  ProductIcon,
  type ResearchWorkspaceState,
  ScreenedList,
  SORT_OPTIONS,
  useResearchWorkspace,
  WatchControls,
} from '../shared';

/** Six small bars, one per confidence factor, so a card shows what drives its score. */
function FactorStrip({ insight }: { insight: ResearchInsight }) {
  return (
    <ul className="grid list-none grid-cols-6 gap-1.5" aria-label="Confidence factors">
      {insight.confidence.factors.map((factor) => {
        const value = factor.score === null ? 0 : factor.score * 100;
        const color = factor.score === null ? SERIES.muted : factor.score >= 0.75 ? SERIES.price : factor.score >= 0.45 ? SERIES.breakeven : SERIES.loss;
        const weakest = insight.confidence.weakest === factor.id;
        return (
          <li key={factor.id} className="flex min-w-0 flex-col gap-1">
            <MeterBar value={value} color={color} />
            <span className={cn('truncate font-data text-micro', weakest ? 'text-name' : 'text-faint')}>
              {FACTOR_SHORT_LABEL[factor.id]}
              <span className="sr-only"> {CONFIDENCE_FACTOR_LABELS[factor.id]} {factor.score === null ? 'unknown' : Math.round(value)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={eyebrow({ size: 'micro' })}>{label}</span>
      <span className={cn('truncate font-data text-h3', tone)}>{value}</span>
    </div>
  );
}

function CardFigures({ insight }: { insight: ResearchInsight }) {
  const figures = keyFigures(insight);
  const pick = (id: string) => figures.find((figure) => figure.id === id);
  return (
    <div className="grid grid-cols-3 gap-2">
      {(
        [
          ['margin', 'Margin'],
          ['iskh', 'ISK/h'],
          ['odds', 'Odds'],
        ] as const
      ).map(([id, label]) => {
        const figure = pick(id);
        return <Figure key={id} label={label} value={figure?.value ?? '—'} tone={FIGURE_TONE[figure?.tone ?? 'plain']} />;
      })}
    </div>
  );
}

function ProductCard({ insight, onOpen }: { insight: ResearchInsight; onOpen: () => void }) {
  const screened = insight.gates.length > 0;
  return (
    <Button
      variant="bare"
      onClick={onOpen}
      className={cn(
        cardSurface,
        'group flex min-w-0 cursor-pointer flex-col items-stretch gap-3 p-4 text-left transition-[border-color,box-shadow] hover:border-border-active hover:shadow-cta-glow',
        screened && 'opacity-80',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <ProductIcon insight={insight} size={32} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-ui text-ui font-semibold text-name group-hover:text-isk-bright">{insight.name}</span>
            <span className="font-data text-micro text-muted">
              {formatIsk(insight.sell)} ask · {trendText(insight)}
            </span>
          </span>
        </span>
        <BandPill band={insight.band} score={insight.confidence.score} />
      </div>
      <Measured>{(width) => <Spark insight={insight} width={width} height={46} days={45} />}</Measured>
      <CardFigures insight={insight} />
      <FactorStrip insight={insight} />
      <span className={cn('font-data text-micro', screened ? 'text-dps-mid' : 'text-faint')}>
        {screened ? `⚠ ${insight.gates.map((g) => g.label).join(' · ')}` : confidenceHeadline(insight)}
      </span>
    </Button>
  );
}

function DetailPanel({ insight, state, onClose }: { insight: ResearchInsight; state: ResearchWorkspaceState; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-5 pb-8 pt-5">
      <header className="flex items-start justify-between gap-4">
        <span className="flex min-w-0 items-center gap-3">
          <ProductIcon insight={insight} size={44} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <h2 id="research-detail-title" className="truncate font-display text-h2 font-bold text-name">
              {insight.name}
            </h2>
            <span className="font-data text-micro text-muted">
              Ask {formatIsk(insight.sell)} · Bid {formatIsk(insight.buy)} · {trendText(insight)}
            </span>
          </span>
        </span>
        <Button variant="bare" onClick={onClose} aria-label="Close" className="cursor-pointer text-h3 text-muted hover:text-name">
          ✕
        </Button>
      </header>
      <div className="flex items-center gap-4">
        <ConfidenceDial score={insight.confidence.score} band={insight.band === null ? null : BAND_LABEL[insight.band]} size={96} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={eyebrow({ size: 'micro' })}>Confidence, factor by factor</span>
          <Measured>{(width) => <ConfidenceWaterfall confidence={insight.confidence} width={width} height={128} />}</Measured>
        </div>
      </div>
      <p className="text-ui text-text">{confidenceHeadline(insight)}</p>
      <Measured>{(width) => <PriceChart insight={insight} width={width} height={210} />}</Measured>
      <Measured>{(width) => <VolumeChart insight={insight} width={width} height={84} />}</Measured>
      <section className="flex flex-col gap-2">
        <h3 className={eyebrow({ size: 'micro' })}>Odds of profit at sale</h3>
        <Measured>{(width) => <ProfitDistribution insight={insight} width={width} />}</Measured>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className={eyebrow({ size: 'micro' })}>One unit, list price to profit</h3>
        <Measured>
          {(width) => <MarginBreakdown insight={insight} salesTaxPct={state.assumptions.salesTaxPct} brokerFeePct={state.assumptions.brokerFeePct} width={width} />}
        </Measured>
      </section>
      <dl className="grid grid-cols-2 gap-3">
        {keyFigures(insight).map((figure) => (
          <div key={figure.id} className={cn(cardSurface, 'flex flex-col gap-0.5 px-3 py-2.5')}>
            <dt className={eyebrow({ size: 'micro' })}>{figure.label}</dt>
            <dd className={cn('font-data text-h3', FIGURE_TONE[figure.tone])}>{figure.value}</dd>
            <dd className="font-data text-micro text-faint">{figure.note}</dd>
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-2">
        <h3 className={eyebrow({ size: 'micro' })}>Busiest days</h3>
        <Measured>{(width) => <WeekdayBars index={insight.weekday} width={Math.min(width, 320)} />}</Measured>
      </section>
      <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-4">
        <Button variant="bare" onClick={() => { state.unwatch(insight); onClose(); }} className="cursor-pointer font-data text-micro text-muted hover:text-tone-red">
          Stop watching
        </Button>
        <Link href={`/industry/${insight.blueprintTypeId}`} className="rounded-ctl bg-brand-gradient px-4 py-2 font-ui text-ui font-semibold text-isk-ink no-underline shadow-cta-glow hover:brightness-110">
          Plan this build →
        </Link>
      </div>
    </div>
  );
}

/**
 * Cards: the research landing as a visual board. The opportunity map leads,
 * each watched product is a card with its price, three headline numbers and
 * its confidence factors, and a card opens its full analysis in a side panel.
 */
export function CardsResearch({ initialOpen = false }: { initialOpen?: boolean }) {
  const state = useResearchWorkspace();
  const [open, setOpen] = useState(initialOpen);
  const openCard = (id: number) => {
    state.select(id);
    setOpen(true);
  };
  return (
    <div className="reveal reveal-2 flex flex-col gap-6">
      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col justify-between gap-5">
          <div className="flex flex-col gap-2">
            <PageTitle size="compact">Market research</PageTitle>
            <p className="max-w-lg text-ui text-muted">
              Find what’s worth building before you plan it. Every product you watch is priced at Jita, costed from its blueprint, and scored for how likely the build is to pay.
            </p>
          </div>
          <div className={cn(cardSurface, 'flex flex-col gap-3 p-4')}>
            <span className={eyebrow({ size: 'micro' })}>Watch a product</span>
            <WatchControls state={state} />
          </div>
          <div className={cn(cardSurface, 'p-4')}>
            <AssumptionControls assumptions={state.assumptions} update={state.update} />
          </div>
        </div>
        <section className={cn(cardSurface, 'flex flex-col gap-2 p-4')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-h3 font-bold text-name">Opportunity map</h2>
            <span className="font-data text-micro text-faint">Up is surer · right pays more · size is ISK traded</span>
          </div>
          <Measured>{(width) => <OpportunityMap insights={state.insights} width={width} height={300} selected={open ? (state.selected?.blueprintTypeId ?? null) : null} onSelect={openCard} />}</Measured>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-h2 font-bold text-name">
          Watching <span className="font-data text-h3 text-muted">{state.list.length}</span>
        </h2>
        <SegmentedControl label="Sort products" density="compact" value={state.sort} onChange={(value) => state.setSort(value as InsightSortKey)} options={SORT_OPTIONS} />
      </div>
      {!state.ready ? (
        <EmptyState> </EmptyState>
      ) : state.list.length === 0 ? (
        <EmptyState>Nothing watched yet. Search for a blueprint to start researching it.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.insights.map((insight) => (
            <ProductCard key={insight.blueprintTypeId} insight={insight} onOpen={() => openCard(insight.blueprintTypeId)} />
          ))}
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <SectionPanel title="Screened out">
          <div className="px-3.5 pb-3.5 pt-2">
            <ScreenedList insights={state.screened} onSelect={openCard} />
          </div>
        </SectionPanel>
        <SectionPanel title="How we measure">
          <MethodNotes className="px-3.5 pb-4 pt-2" />
        </SectionPanel>
      </div>
      <Dialog
        open={open && state.selected !== null}
        onOpenChange={setOpen}
        labelledBy="research-detail-title"
        className="left-auto right-0 top-0 h-dvh w-[min(40rem,100vw)] translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 data-[starting-style]:scale-100 data-[starting-style]:translate-x-8 data-[ending-style]:scale-100"
      >
        {state.selected !== null && <DetailPanel insight={state.selected} state={state} onClose={() => setOpen(false)} />}
      </Dialog>
    </div>
  );
}

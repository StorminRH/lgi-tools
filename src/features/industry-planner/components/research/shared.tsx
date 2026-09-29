'use client';

import { useMemo, useState } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/input';
import { Pill, type PillTone } from '@/components/ui/pill';
import { SegmentedControl } from '@/components/ui/segmented';
import { eyebrow } from '@/components/ui/type-roles';
import type { ConfidenceBand } from '@/data/industry-math/build-confidence';
import { itemImage } from '@/data/eve-data/type-images';
import { initials } from '@/lib/format/names';
import type { RecentBlueprint } from '../../recent-blueprints';
import { MARKET_SHARE_OPTIONS, MAX_FEE_PCT } from '../../research-assumptions';
import { type BatchSize, type InsightSortKey, type ResearchAssumptions, type ResearchInsight, sortInsights } from '../../research-insight';
import { BAND_LABEL, BATCH_LABEL, type FigureTone } from '../../research-insight-view';
import { useRecentBlueprints } from '../../use-recent-blueprints';
import { useResearchInsights } from '../../use-research';
import { useResearchAssumptions } from '../../use-research-assumptions';
import { useWatchlist } from '../../use-watchlist';
import { isWatched } from '../../watchlist';
import { BlueprintSearch } from '../BlueprintSearch';

export const FIGURE_TONE: Record<FigureTone, string> = {
  good: 'text-isk',
  warn: 'text-dps-mid',
  bad: 'text-dps-high',
  plain: 'text-name',
};

const BAND_TONE: Record<ConfidenceBand, PillTone> = {
  high: 'green',
  medium: 'blue',
  low: 'orange',
  avoid: 'red',
};

/** Everything a research design reads and changes, in one place. */
export function useResearchWorkspace() {
  const { watchlist, toggle } = useWatchlist();
  const recent = useRecentBlueprints();
  const { assumptions, update } = useResearchAssumptions();
  const [sort, setSort] = useState<InsightSortKey>('confidence');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hideScreened, setHideScreened] = useState(false);
  const list = useMemo(() => watchlist ?? [], [watchlist]);
  const { insights, loading } = useResearchInsights(list, assumptions);
  const sorted = useMemo(() => sortInsights(insights, sort), [insights, sort]);
  const visible = hideScreened ? sorted.filter((insight) => insight.gates.length === 0) : sorted;
  const selected = sorted.find((insight) => insight.blueprintTypeId === selectedId) ?? sorted[0] ?? null;
  const suggestions = (recent ?? []).filter((entry) => !isWatched(list, entry.typeId)).slice(0, 5);
  return {
    ready: watchlist !== null,
    list,
    toggle,
    watch: (entry: RecentBlueprint) => {
      if (!isWatched(list, entry.typeId)) toggle(entry);
    },
    unwatch: (insight: ResearchInsight) => {
      const entry = list.find((candidate) => candidate.typeId === insight.blueprintTypeId);
      if (entry !== undefined) toggle(entry);
    },
    suggestions,
    assumptions,
    update,
    sort,
    setSort,
    insights: sorted,
    visible,
    screened: sorted.filter((insight) => insight.gates.length > 0),
    hideScreened,
    setHideScreened,
    selected,
    select: setSelectedId,
    loading,
  };
}

export type ResearchWorkspaceState = ReturnType<typeof useResearchWorkspace>;

const BATCH_OPTIONS = (Object.keys(BATCH_LABEL) as BatchSize[]).map((value) => ({ value, label: BATCH_LABEL[value] }));
const SHARE_OPTIONS = MARKET_SHARE_OPTIONS.map((share) => ({ value: String(share), label: `${Math.round(share * 100)}%` }));

function PctField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-1">
      <span className={eyebrow({ size: 'micro' })}>{label}</span>
      <Input
        size="sm"
        inputMode="decimal"
        aria-label={`${label} percent`}
        value={draft ?? String(Number(value.toFixed(2)))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (draft !== null && Number.isFinite(n) && n >= 0 && n <= MAX_FEE_PCT) onChange(n);
          setDraft(null);
        }}
        trailing={<span className="font-data text-micro text-muted">%</span>}
        className="w-20"
      />
    </label>
  );
}

/**
 * What the numbers assume: how big a batch is, how much of the market it may
 * take a day, and the seller's tax and broker fee.
 */
export function AssumptionControls({
  assumptions,
  update,
  className,
}: {
  assumptions: ResearchAssumptions;
  update: (patch: Partial<ResearchAssumptions>) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end gap-x-5 gap-y-3', className)}>
      <div className="flex flex-col gap-1">
        <span className={eyebrow({ size: 'micro' })}>Batch</span>
        <SegmentedControl
          label="Batch size"
          density="compact"
          value={assumptions.batch}
          onChange={(value) => update({ batch: value as BatchSize })}
          options={BATCH_OPTIONS}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className={eyebrow({ size: 'micro' })}>Market share</span>
        <SegmentedControl
          label="Share of daily volume the batch takes"
          density="compact"
          value={String(assumptions.marketShare)}
          onChange={(value) => update({ marketShare: Number(value) })}
          options={SHARE_OPTIONS}
        />
      </div>
      <PctField label="Sales tax" value={assumptions.salesTaxPct} onChange={(salesTaxPct) => update({ salesTaxPct })} />
      <PctField label="Broker" value={assumptions.brokerFeePct} onChange={(brokerFeePct) => update({ brokerFeePct })} />
    </div>
  );
}

/** Add a product to research, with recent plans offered one click away. */
export function WatchControls({ state, compact = false }: { state: ResearchWorkspaceState; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <BlueprintSearch key={state.list.length} placeholder="Watch a blueprint or reaction" onPick={state.watch} />
      {state.suggestions.length > 0 && (
        <div className={cn('flex flex-wrap items-center gap-1.5', compact && 'hidden sm:flex')}>
          <span className="font-data text-micro text-faint">From recent plans</span>
          {state.suggestions.map((entry) => (
            <Button key={entry.typeId} variant="ghost" size="sm" onClick={() => state.watch(entry)} aria-label={`Watch ${entry.name}`}>
              + {entry.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductIcon({ insight, size = 26 }: { insight: Pick<ResearchInsight, 'productTypeId' | 'name'>; size?: number }) {
  return <TypeIcon {...itemImage(insight.productTypeId)} size={size} mono={initials(insight.name)} />;
}

export function BandPill({ band, score }: { band: ConfidenceBand | null; score: number | null }) {
  if (band === null) return <span className="font-data text-micro text-faint">—</span>;
  return (
    <Pill tone={BAND_TONE[band]} className="gap-1.5 whitespace-nowrap px-2 py-px text-micro font-normal">
      <span className="font-semibold tabular-nums">{score}</span>
      {BAND_LABEL[band]}
    </Pill>
  );
}

/** Products a screen rules out, each with every screen it failed. */
export function ScreenedList({ insights, onSelect }: { insights: readonly ResearchInsight[]; onSelect?: (id: number) => void }) {
  if (insights.length === 0) return <p className="text-ui text-muted">Every watched product passes the screens.</p>;
  return (
    <ul className="flex list-none flex-col gap-2">
      {insights.map((insight) => (
        <li key={insight.blueprintTypeId} className="flex min-w-0 items-start gap-2.5">
          <ProductIcon insight={insight} size={22} />
          <div className="flex min-w-0 flex-col">
            <Button
              variant="bare"
              onClick={() => onSelect?.(insight.blueprintTypeId)}
              className="cursor-pointer truncate text-left text-ui text-name hover:text-isk"
            >
              {insight.name}
            </Button>
            {insight.gates.map((gate) => (
              <span key={gate.id} className="font-data text-micro text-dps-mid">
                {gate.label}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

const METHOD: { term: string; body: string }[] = [
  {
    term: 'Confidence',
    body: 'A weighted geometric blend of six factors, each 0–100: sell-through 25%, profit odds 25%, price stability 15%, demand 15%, trend 10%, history depth 10%. One weak factor pulls the whole score down; each factor shows the points it costs.',
  },
  {
    term: 'Profit odds',
    body: 'The chance the sale price clears breakeven when the average unit sells. Price is modelled lognormally from today’s expected list price: the daily swing scales with the square root of time, and a fitted 30-day trend nudges the centre at half strength.',
  },
  {
    term: 'Expected list price',
    body: 'Never above today’s ask, pulled halfway to the week’s typical sell-side fill, less half the typical daily range for being undercut (0.2%–5%).',
  },
  {
    term: 'Breakeven',
    body: 'Materials at Jita buy plus the job fee, divided by what a sale keeps after sales tax and broker fee. Job fees assume a 5% cost index until the plan picks a system.',
  },
  {
    term: 'Daily swing',
    body: 'The typical one-day move in the daily average, read from the median absolute deviation so one fat-finger trade can’t inflate it. Highs and lows are clipped to the usual range before charting.',
  },
  {
    term: 'Sell-through',
    body: 'Days to sell the batch if it takes your chosen share of the average daily volume.',
  },
  {
    term: 'Slots absorbed',
    body: 'Daily volume divided by what one slot makes in a day. Under 1, a single slot outproduces the whole market.',
  },
  {
    term: 'Trend',
    body: 'The week’s exponential average against the month’s. Only a sliding price costs confidence; a rising one may not last the build.',
  },
];

/** How every research number is measured, in plain words. */
export function MethodNotes({ className }: { className?: string }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-3 md:grid-cols-2', className)}>
      {METHOD.map((entry) => (
        <div key={entry.term} className="flex flex-col gap-0.5">
          <dt className="font-data text-micro uppercase tracking-label text-isk">{entry.term}</dt>
          <dd className="text-ui text-muted">{entry.body}</dd>
        </div>
      ))}
    </dl>
  );
}

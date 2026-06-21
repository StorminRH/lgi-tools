'use client';

import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { formatIsk } from '@/lib/format/isk';
import { formatPct } from '@/lib/format/number';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { selectNet, type MarginMode } from '../cockpit-margin';
import {
  deriveMarginFigures,
  marginToneClass,
  selectMarginCaption,
  type MarginCaption,
} from '../industry-styles';
import type { BlueprintStructure, BuildTimeView } from '../types';
import { KpiHead, KpiTile, KPI_FIG, KPI_SUB, SimpleTile } from './kpi-tile';
import { MarketScorePanel } from './MarketScorePanel';
import { usePricing } from './PricingProvider';

export type { MarginMode };

// The Build-time figures are sourced by a follow-up data branch (reads the
// per-activity `time` from each blueprint's `activities` JSONB and models the
// all-jobs total); this returns null until then, so the tile renders an honest
// placeholder. The follow-up fills the body (taking the structure it needs).
function buildTimeFor(): BuildTimeView | null {
  return null;
}

// The concise honest caption under the margin figure (the hero's
// MarginCaptionLine copy, condensed to one line for the tile).
function captionText(caption: MarginCaption, systemName: string | undefined): string {
  switch (caption) {
    case 'net-clean':
      return 'Net of job install + sell fees · NPC station · ME 0.';
    case 'missing-cost-index':
      return `No cost index for ${systemName ?? 'this system'} — install fee incomplete.`;
    case 'missing-adjusted-prices':
      return 'Some inputs lack a reference price — net margin optimistic.';
    case 'gross-manufacturing':
      return 'Materials only — pick a build system for net margin · ME 0.';
    case 'gross-reaction':
      return 'Net margin: manufacturing only for now.';
  }
}

function GrossNetToggle({
  showNet,
  netAvailable,
  setMode,
}: {
  showNet: boolean;
  netAvailable: boolean;
  setMode: (m: MarginMode) => void;
}) {
  const btn =
    'px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] cursor-pointer transition-colors';
  const on = 'text-name bg-[rgba(255,255,255,0.05)]';
  return (
    <span className="inline-flex overflow-hidden rounded-[3px] border border-border-soft">
      <button
        type="button"
        onClick={() => setMode('gross')}
        aria-pressed={!showNet}
        className={cn(btn, !showNet ? on : 'text-faint hover:text-muted')}
      >
        Gross
      </button>
      <button
        type="button"
        onClick={() => netAvailable && setMode('net')}
        disabled={!netAvailable}
        aria-pressed={showNet}
        className={cn(
          btn,
          showNet ? on : 'text-faint hover:text-muted',
          !netAvailable && 'cursor-not-allowed opacity-40 hover:text-faint',
        )}
      >
        Net
      </button>
    </span>
  );
}

// The Cockpit KPI tile row: input cost · sell · net margin (Gross/Net toggle) ·
// market score (with "?" breakdown) · build time. All figures read the live
// pricing store; the margin tile flips gross↔net and each figure flashes in as
// prices land.
export function CockpitKpis({
  structure,
  marginMode,
  setMarginMode,
}: {
  structure: BlueprintStructure;
  marginMode: MarginMode;
  setMarginMode: (m: MarginMode) => void;
}) {
  const { pricing, seeded, location } = usePricing();
  const summary = pricing?.summary ?? null;

  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  const { net, netAvailable } = selectNet(
    pricing,
    structure.activityId,
    location !== null,
    marginMode,
  );
  const { showNet, margin, marginPct, sign, missingSystemCostIndex, missingAdjustedPriceCount } =
    deriveMarginFigures(summary, net);
  const caption = selectMarginCaption({
    showNet,
    isManufacturing,
    missingSystemCostIndex,
    missingAdjustedPriceCount,
  });
  const buildTime = buildTimeFor();

  return (
    <div className="grid grid-cols-2 gap-3 min-[760px]:grid-cols-3 min-[1080px]:grid-cols-6">
      <SimpleTile
        label="Input cost"
        value={<LivePrice value={summary ? formatIsk(summary.inputCost) : '—'} />}
        valueClass="text-name"
        sub="raw @ Jita buy"
      />
      <SimpleTile
        label="Sell · Jita"
        accent="green"
        value={<LivePrice value={summary ? formatIsk(summary.revenue) : '—'} />}
        valueClass="text-isk"
        sub="best sell order"
      />

      <KpiTile accent="green" span2>
        <KpiHead
          label={showNet ? 'Net margin' : 'Gross margin'}
          right={
            <GrossNetToggle showNet={showNet} netAvailable={netAvailable} setMode={setMarginMode} />
          }
        />
        {summary ? (
          <div className={cn(KPI_FIG, marginToneClass(marginPct))}>
            <LivePrice value={`${sign}${formatIsk(margin)}`} />
            {marginPct !== null && (
              <span className="ml-1.5 text-[13px]">({formatPct(marginPct)})</span>
            )}
          </div>
        ) : (
          <div className={cn(KPI_FIG, 'text-muted')}>
            {seeded ? 'Pricing unavailable' : 'Calculating…'}
          </div>
        )}
        <div className={KPI_SUB}>{captionText(caption, location?.systemName)}</div>
      </KpiTile>

      <MarketScorePanel structure={structure} />

      <SimpleTile
        label="Build time"
        accent="blue"
        value={buildTime ? buildTime.topJob : '—'}
        valueClass="text-evb-bright"
        sub={buildTime ? `top job · ${buildTime.allJobs} all jobs` : 'estimate pending'}
      />
    </div>
  );
}

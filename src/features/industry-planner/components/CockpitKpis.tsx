'use client';

import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { formatIsk } from '@/lib/format/isk';
import { formatPct } from '@/lib/format/number';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { toBuildTimeView } from '../build-time';
import { selectNet, type MarginMode } from '../cockpit-margin';
import { buildFeeBreakdown, type FeeLine } from '../fee-breakdown';
import {
  deriveMarginFigures,
  marginToneClass,
  selectMarginCaption,
  type MarginCaption,
} from '../industry-styles';
import type { BlueprintStructure, NetMarginView } from '../types';
import { KpiHead, KpiHelp, KpiTile, KPI_FIG, KPI_SUB, SimpleTile } from './kpi-tile';
import { MarketScorePanel } from './MarketScorePanel';
import { usePricing } from './PricingProvider';

export type { MarginMode };

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
  const on = 'text-name bg-row-on';
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

// The Net-margin tile's "?" hover: the itemized install + sell fee breakdown the
// retired Raw-ledger view used to show, restored read-only from the net path's
// own figures. Shown only on the net path (a location picked), where the fees are
// real. Logic lives in the pure buildFeeBreakdown; this is the humble shell.
function FeeHover({ net, systemName }: { net: NetMarginView; systemName: string | undefined }) {
  const fees = buildFeeBreakdown(net);
  const isk = (v: number | null) => (v === null ? '—' : formatIsk(v));
  const row = (line: FeeLine) => (
    <div key={line.label} className="flex items-center justify-between gap-4">
      <span className="text-muted">{line.label}</span>
      <span className="tabular-nums text-text">{isk(line.value)}</span>
    </div>
  );
  const subtotal = (label: string, value: number | null) => (
    <div className="mt-0.5 flex items-center justify-between gap-4 border-t border-border-soft pt-0.5">
      <span className="text-text">{label}</span>
      <span className="tabular-nums text-name">{isk(value)}</span>
    </div>
  );
  return (
    <KpiHelp label="Fee breakdown">
      <PopoverHeading>{`Fees${systemName ? ` · ${systemName}` : ''}`}</PopoverHeading>
      <div className="flex flex-col gap-1 font-body text-[12px] leading-snug">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Install</div>
        {fees.install.map(row)}
        {subtotal('Install fee', fees.installTotal)}
      </div>
      <div className="flex flex-col gap-1 font-body text-[12px] leading-snug">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Sell</div>
        {fees.sell.map(row)}
        {subtotal('Sell fees', fees.sellTotal)}
      </div>
    </KpiHelp>
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
  const { pricing, seeded, location, runs } = usePricing();
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
  const buildTime = toBuildTimeView(structure.topJobSeconds, runs);

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
            <span className="flex items-center gap-2">
              {net && <FeeHover net={net} systemName={location?.systemName} />}
              <GrossNetToggle showNet={showNet} netAvailable={netAvailable} setMode={setMarginMode} />
            </span>
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

      <KpiTile accent="blue">
        <KpiHead
          label="Build time"
          right={
            <KpiHelp label="How build time is estimated">
              <PopoverHeading>Build time — final job</PopoverHeading>
              <PopoverRow label="Runs">×{runs}</PopoverRow>
              <PopoverRow label="Time efficiency">0% (unresearched)</PopoverRow>
              <PopoverRow label="Skills &amp; structure">none applied</PopoverRow>
            </KpiHelp>
          }
        />
        <div className={cn(KPI_FIG, 'text-evb-bright')}>{buildTime ? buildTime.topJob : '—'}</div>
        <div className={KPI_SUB}>
          {buildTime ? 'final job · ME 0, base skills' : 'estimate pending'}
        </div>
      </KpiTile>
    </div>
  );
}

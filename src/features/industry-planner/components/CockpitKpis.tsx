'use client';

import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { Popover, PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { useSystemName } from '@/components/use-system-search';
import { formatIsk } from '@/lib/format/isk';
import { formatPct } from '@/lib/format/number';
import { formatBuildDuration, type BuildTimes } from '../build-time';
import {
  cockpitMarginView,
  indefiniteArticleForPct,
  inputCostView,
  sellTileView,
  type CockpitMarginView,
} from '../cockpit-kpis-view';
import { type MarginMode } from '../cockpit-margin';
import type { CostBasis } from '../cost-basis-view';
import { buildFeeBreakdown, type FeeLine } from '../fee-breakdown';
import { timeLeverRows } from '../time-lever-rows';
import { marginToneClass, type RegionalDiscountCallout } from '../industry-styles';
import type { BlueprintPricing, BlueprintStructure, NetMarginView } from '../types';
import { KpiHead, KpiHelp, KpiTile, KPI_FIG, SimpleTile } from './kpi-tile';
import { MarketScorePanel } from './MarketScorePanel';
import { usePricing } from './PricingProvider';

export type { MarginMode };

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
    'px-2 py-0.5 font-mono text-label uppercase tracking-[0.1em] cursor-pointer transition-colors';
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

// The input-cost basis pair (Raw|Item, 3.7.21.1) — same visual family as
// GrossNetToggle. Both states are always available (no gating): Raw is the
// whole-run buy list, Item the consumed bill.
function RawItemToggle({
  basis,
  setBasis,
}: {
  basis: CostBasis;
  setBasis: (b: CostBasis) => void;
}) {
  const btn =
    'px-2 py-0.5 font-mono text-label uppercase tracking-[0.1em] cursor-pointer transition-colors';
  const on = 'text-name bg-row-on';
  return (
    <span className="inline-flex overflow-hidden rounded-[3px] border border-border-soft">
      <button
        type="button"
        onClick={() => setBasis('batched')}
        aria-pressed={basis === 'batched'}
        className={cn(btn, basis === 'batched' ? on : 'text-faint hover:text-muted')}
      >
        Raw
      </button>
      <button
        type="button"
        onClick={() => setBasis('marginal')}
        aria-pressed={basis === 'marginal'}
        className={cn(btn, basis === 'marginal' ? on : 'text-faint hover:text-muted')}
      >
        Item
      </button>
    </span>
  );
}

// The Input-cost tile's "?" hover: both bases side by side, whichever view is
// active, so the toggle never hides a number.
function InputCostHelp({ bases }: { bases: { batched: number; marginal: number } | null }) {
  return (
    <KpiHelp label="How input cost is computed">
      <PopoverHeading>Input cost</PopoverHeading>
      <PopoverRow label="Raw">{bases ? formatIsk(bases.batched) : '—'}</PopoverRow>
      <PopoverRow label="Item">{bases ? formatIsk(bases.marginal) : '—'}</PopoverRow>
      <p className="max-w-[240px] font-body text-body leading-snug text-muted">
        Raw is the full production line, including the excess that whole batches produce.
        Item is only what this build consumes.
      </p>
    </KpiHelp>
  );
}

// The Input-cost tile (3.7.21.1): figure + Raw|Item toggle + the both-bases
// popover. Self-contained on the pricing context so the KPI row stays a thin
// composition; the toggle reflects the user's intent immediately while the
// figure carries the summary's own basis stamp.
function InputCostTile() {
  const { pricing, costBasis, setCostBasis } = usePricing();
  const view = inputCostView(pricing);
  return (
    <KpiTile>
      <KpiHead
        label="Input cost"
        right={
          <span className="flex items-center gap-2">
            <InputCostHelp bases={view.bases} />
            <RawItemToggle basis={costBasis} setBasis={setCostBasis} />
          </span>
        }
      />
      <div className={cn(KPI_FIG, 'text-name')}>
        <LivePrice value={view.inputCost} />
      </div>
    </KpiTile>
  );
}

// The Sell·Jita opportunity callout (3.7.26.1): a cheaper sell book exists
// outside Jita 4-4 and cleared the ingest gate. Renders only once the shared
// system index resolves the name (system only, never a station) — an
// OPPORTUNITY affordance, green against the amber thin-order warning beside
// it; the two say different things and can show together.
function RegionalDiscountBadge({ callout }: { callout: RegionalDiscountCallout }) {
  const systemName = useSystemName(callout.systemId);
  if (!systemName) return null;
  const article = indefiniteArticleForPct(callout.pct);
  return (
    <Popover
      label="Regional discount available"
      trigger={`−${callout.pct}%`}
      triggerClassName="inline-flex h-[15px] cursor-help items-center rounded-full border border-isk-dim bg-bg px-1.5 font-mono text-ui font-bold tabular-nums text-isk hover:border-isk"
    >
      <PopoverHeading>Regional discount</PopoverHeading>
      <p className="max-w-[240px] font-body text-body leading-snug text-muted">
        Available at <span className="text-text">{systemName}</span> for {article}{' '}
        <span className="text-isk">{callout.pct}%</span> discount —{' '}
        {callout.units.toLocaleString('en-US')} units.
      </p>
    </Popover>
  );
}

// The Sell·Jita tile (3.7.25.1): the revenue figure + the thin-order honesty
// badge — when the product's lowest ask sits well under the volume-weighted
// front of the book, the headline price is anchored by an order too small to
// matter, and the badge says so. Since 3.7.26.1 the price is the Jita 4-4
// book and the opportunity callout rides beside the badge (both can render).
// Self-contained on the pricing context (the InputCostTile shape) so the KPI
// row stays a thin composition; the verdicts are the pure mappers.
function SellTile() {
  const { pricing } = usePricing();
  const view = sellTileView(pricing);
  return (
    <SimpleTile
      label="Sell · Jita"
      right={
        view.hasBadge && (
          <span className="flex items-center gap-2">
            {view.discount && <RegionalDiscountBadge callout={view.discount} />}
            {view.thinAnchor && (
              <PriceConfidence level={view.thinAnchor.level} reasons={view.thinAnchor.reasons} />
            )}
          </span>
        )
      }
      value={<LivePrice value={view.revenue} />}
      valueClass="text-isk"
    />
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
      <div className="flex flex-col gap-1 font-body text-ui leading-snug">
        <div className="font-mono text-label uppercase tracking-[0.12em] text-faint">Install</div>
        {fees.install.map(row)}
        {subtotal('Install fee', fees.installTotal)}
      </div>
      <div className="flex flex-col gap-1 font-body text-ui leading-snug">
        <div className="font-mono text-label uppercase tracking-[0.12em] text-faint">Sell</div>
        {fees.sell.map(row)}
        {subtotal('Sell fees', fees.sellTotal)}
      </div>
    </KpiHelp>
  );
}

// The Total-job-time "?" hover: the per-job calculation. Each line is a buildable's
// TE-adjusted per-run time × its batched run count = that job's total; the final
// product leads, the components follow by descending total, and the lines sum to the
// figure on the tile. The list scrolls for a deep build (a capital has dozens).
function TotalJobHover({ buildTimes }: { buildTimes: BuildTimes }) {
  return (
    <KpiHelp label="How total job time is calculated">
      <PopoverHeading>Total job time — whole tree</PopoverHeading>
      <div className="flex flex-col">
        <div className="flex max-h-[240px] flex-col gap-1 overflow-y-auto pr-1">
          {buildTimes.breakdown.map((line) => (
            <div
              key={line.typeId}
              className="flex items-baseline justify-between gap-3 font-mono text-ui"
            >
              <span className="truncate text-muted">{line.name}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums text-faint">
                {formatBuildDuration(line.perRunSeconds)} × {line.runs} ={' '}
                <span className="text-text">{formatBuildDuration(line.totalSeconds)}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-border-soft pt-1.5 font-mono text-ui">
          <span className="uppercase tracking-[0.14em] text-muted">Total</span>
          <span className="tabular-nums font-semibold text-evb-bright">
            {buildTimes.totalProduction ?? '—'}
          </span>
        </div>
      </div>
      <p className="font-mono text-micro leading-snug tracking-[0.04em] text-faint">
        Sequential — one job at a time. TE applied per blueprint; structure and build-character
        skills applied when selected; parallel slots not counted.
      </p>
    </KpiHelp>
  );
}

// The net-margin figure: the priced margin (toned) with its percent, or a
// pricing-pending / unavailable placeholder before the estimate settles.
function MarginFigure({
  view,
  summary,
  seeded,
}: {
  view: CockpitMarginView;
  summary: BlueprintPricing['summary'] | null;
  seeded: boolean;
}) {
  if (!summary) {
    return <div className={cn(KPI_FIG, 'text-muted')}>{seeded ? 'Pricing unavailable' : 'Calculating…'}</div>;
  }
  return (
    <div className={cn(KPI_FIG, marginToneClass(view.marginPct))}>
      <LivePrice value={`${view.sign}${formatIsk(view.margin)}`} />
      {view.marginPct !== null && <span className="ml-1.5 text-ui">({formatPct(view.marginPct)})</span>}
    </div>
  );
}

// The net-margin tile: the Gross/Net toggle, the fee breakdown hover (net path
// only), and the margin figure. All the source/label decisions come from the
// pure cockpitMarginView.
function NetMarginTile({
  view,
  pricing,
  seeded,
  setMarginMode,
}: {
  view: CockpitMarginView;
  pricing: BlueprintPricing | null;
  seeded: boolean;
  setMarginMode: (m: MarginMode) => void;
}) {
  return (
    <KpiTile>
      <KpiHead
        label={view.marginLabel}
        right={
          <span className="flex items-center gap-2">
            {view.net && <FeeHover net={view.net} systemName={view.feeSystemName} />}
            <GrossNetToggle showNet={view.showNet} netAvailable={view.netAvailable} setMode={setMarginMode} />
          </span>
        }
      />
      <MarginFigure view={view} summary={pricing?.summary ?? null} seeded={seeded} />
    </KpiTile>
  );
}

// The Build-time tile: the final-job time figure + the per-lever hover.
function BuildTimeTile({
  runs,
  buildTimes,
  leverRows,
}: {
  runs: number;
  buildTimes: BuildTimes;
  leverRows: ReturnType<typeof timeLeverRows>;
}) {
  return (
    <KpiTile>
      <KpiHead
        label="Build time"
        right={
          <KpiHelp label="How build time is estimated">
            <PopoverHeading>Build time — final job</PopoverHeading>
            <PopoverRow label="Runs">×{runs}</PopoverRow>
            {/* No owned/manual qualifier on a non-zero value: topTe is the effective TE
                and can come from a manual override, so the bare percentage is honest. */}
            <PopoverRow label="Time efficiency">
              {buildTimes.topTe}%{buildTimes.topTe === 0 ? ' (unresearched)' : ''}
            </PopoverRow>
            <PopoverRow label="Skills">{leverRows.skills}</PopoverRow>
            <PopoverRow label="Structure">{leverRows.structure}</PopoverRow>
          </KpiHelp>
        }
      />
      <div className={cn(KPI_FIG, 'text-evb-bright')}>{buildTimes.topJob ?? '—'}</div>
    </KpiTile>
  );
}

// The Total-job-time tile: the whole-tree sequential production figure + hover.
function TotalJobTile({ buildTimes }: { buildTimes: BuildTimes }) {
  return (
    <KpiTile>
      <KpiHead label="Total job time" right={<TotalJobHover buildTimes={buildTimes} />} />
      <div className={cn(KPI_FIG, 'text-evb-bright')}>{buildTimes.totalProduction ?? '—'}</div>
    </KpiTile>
  );
}

// The Cockpit KPI tile row: input cost · sell · net margin (Gross/Net toggle) ·
// market score (with "?" breakdown) · build time · total job time. All figures read
// the live pricing store; the margin tile flips gross↔net and each figure flashes in
// as prices land. The tiles are render shells over the pure cockpit-kpis-view.
export function CockpitKpis({
  structure,
  marginMode,
  setMarginMode,
}: {
  structure: BlueprintStructure;
  marginMode: MarginMode;
  setMarginMode: (m: MarginMode) => void;
}) {
  const {
    pricing,
    seeded,
    location,
    runs,
    buildTimes,
    reactionSystem,
    reactionNetAvailable,
    buildCharacter,
    skillTimeFactors,
    structureFactors,
  } = usePricing();

  const margin = cockpitMarginView(
    pricing,
    structure.activityId,
    location,
    reactionSystem,
    reactionNetAvailable,
    marginMode,
  );

  // The Build-time hover's honest lever rows — pure + tested in time-lever-rows.ts.
  const leverRows = timeLeverRows({
    topBlueprintTypeId: structure.blueprintTypeId,
    buildCharacterName: buildCharacter?.name ?? null,
    skillTimeFactors,
    structureTeFactorOf: structureFactors.structureTeFactorOf,
  });

  return (
    <div className="grid grid-cols-2 gap-3 min-[760px]:grid-cols-3 min-[1080px]:grid-cols-6">
      <InputCostTile />
      <SellTile />
      <NetMarginTile view={margin} pricing={pricing} seeded={seeded} setMarginMode={setMarginMode} />
      <MarketScorePanel structure={structure} />
      <BuildTimeTile runs={runs} buildTimes={buildTimes} leverRows={leverRows} />
      <TotalJobTile buildTimes={buildTimes} />
    </div>
  );
}

'use client';

import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { Popover, PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { Pill } from '@/components/ui/pill';
import { SegmentedControl } from '@/components/ui/segmented';
import { scrollArea } from '@/components/ui/scroll-area';
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
import {
  useBuildCharacter,
  useBuildPlan,
  useBuildSetup,
  useMarketData,
  usePlannerConfig,
} from './planner-contexts';

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
  return (
    <SegmentedControl
      label="Margin basis"
      density="compact"
      value={showNet ? 'net' : 'gross'}
      onChange={(value) => setMode(value as MarginMode)}
      options={[
        { value: 'gross', label: 'Gross' },
        { value: 'net', label: 'Net', disabled: !netAvailable },
      ]}
    />
  );
}

function RawItemToggle({
  basis,
  setBasis,
}: {
  basis: CostBasis;
  setBasis: (b: CostBasis) => void;
}) {
  return (
    <SegmentedControl
      label="Input cost basis"
      density="compact"
      value={basis}
      onChange={(value) => setBasis(value as CostBasis)}
      options={[
        { value: 'batched', label: 'Raw' },
        { value: 'marginal', label: 'Item' },
      ]}
    />
  );
}

function InputCostHelp({ bases }: { bases: { batched: number; marginal: number } | null }) {
  return (
    <KpiHelp label="How input cost is computed">
      <PopoverHeading>Input cost</PopoverHeading>
      <PopoverRow label="Raw">{bases ? formatIsk(bases.batched) : '—'}</PopoverRow>
      <PopoverRow label="Item">{bases ? formatIsk(bases.marginal) : '—'}</PopoverRow>
      <p className="max-w-[240px] text-body leading-snug text-muted">
        Raw is the full production line, including the excess that whole batches produce.
        Item is only what this build consumes.
      </p>
    </KpiHelp>
  );
}

function InputCostTile() {
  const { pricing, refreshing } = useMarketData();
  const { costBasis, setCostBasis } = usePlannerConfig();
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
      <div className={cn(KPI_FIG, 'text-isk')}>
        <LivePrice value={view.inputCost} pending={refreshing} />
      </div>
    </KpiTile>
  );
}

function RegionalDiscountBadge({ callout }: { callout: RegionalDiscountCallout }) {
  const systemName = useSystemName(callout.systemId);
  if (!systemName) return null;
  const article = indefiniteArticleForPct(callout.pct);
  return (
    <Popover
      label="Regional discount available"
      trigger={<Pill tone="green">−{callout.pct}%</Pill>}
    >
      <PopoverHeading>Regional discount</PopoverHeading>
      <p className="max-w-[240px] text-body leading-snug text-muted">
        Available at <span className="text-text">{systemName}</span> for {article}{' '}
        <span className="text-isk">{callout.pct}%</span> discount —{' '}
        {callout.units.toLocaleString('en-US')} units.
      </p>
    </Popover>
  );
}

function SellTile() {
  const { pricing, refreshing } = useMarketData();
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
      value={<LivePrice value={view.revenue} pending={refreshing} />}
      valueClass="text-isk"
    />
  );
}

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
      <div className="flex flex-col gap-1 text-ui leading-snug">
        <div className="text-label uppercase tracking-wide text-faint">Install</div>
        {fees.install.map(row)}
        {subtotal('Install fee', fees.installTotal)}
      </div>
      <div className="flex flex-col gap-1 text-ui leading-snug">
        <div className="text-label uppercase tracking-wide text-faint">Sell</div>
        {fees.sell.map(row)}
        {subtotal('Sell fees', fees.sellTotal)}
      </div>
    </KpiHelp>
  );
}

function TotalJobHover({ buildTimes }: { buildTimes: BuildTimes }) {
  return (
    <KpiHelp label="How total job time is calculated">
      <PopoverHeading>Total job time — whole tree</PopoverHeading>
      <div className="flex flex-col">
        <div className={cn(scrollArea, 'flex max-h-[240px] flex-col gap-1 overflow-y-auto pr-1')}>
          {buildTimes.breakdown.map((line) => (
            <div
              key={line.typeId}
              className="flex items-baseline justify-between gap-3 text-ui"
            >
              <span className="truncate text-muted">{line.name}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums text-faint">
                {formatBuildDuration(line.perRunSeconds)} × {line.runs} ={' '}
                <span className="text-text">{formatBuildDuration(line.totalSeconds)}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-border-soft pt-1.5 text-ui">
          <span className="uppercase tracking-wide text-muted">Total</span>
          <span className="tabular-nums font-semibold text-evb-bright">
            {buildTimes.totalProduction ?? '—'}
          </span>
        </div>
      </div>
      <p className="text-micro leading-snug tracking-copy text-faint">
        Sequential — one job at a time. TE applied per blueprint; structure and build-character
        skills applied when selected; parallel slots not counted.
      </p>
    </KpiHelp>
  );
}

function MarginFigure({
  view,
  summary,
  seeded,
  refreshing,
}: {
  view: CockpitMarginView;
  summary: BlueprintPricing['summary'] | null;
  seeded: boolean;
  refreshing: boolean;
}) {
  if (!summary) {
    return <div className={cn(KPI_FIG, 'text-muted')}>{seeded ? 'Pricing unavailable' : 'Calculating…'}</div>;
  }
  return (
    <div className={cn(KPI_FIG, marginToneClass(view.marginPct))}>
      <LivePrice value={`${view.sign}${formatIsk(view.margin)}`} pending={refreshing} />
      {view.marginPct !== null && <span className="ml-1.5 text-ui">({formatPct(view.marginPct)})</span>}
    </div>
  );
}

function NetMarginTile({
  view,
  pricing,
  seeded,
  refreshing,
  setMarginMode,
}: {
  view: CockpitMarginView;
  pricing: BlueprintPricing | null;
  seeded: boolean;
  refreshing: boolean;
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
      <MarginFigure
        view={view}
        summary={pricing?.summary ?? null}
        seeded={seeded}
        refreshing={refreshing}
      />
    </KpiTile>
  );
}

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

function TotalJobTile({ buildTimes }: { buildTimes: BuildTimes }) {
  return (
    <KpiTile>
      <KpiHead label="Total job time" right={<TotalJobHover buildTimes={buildTimes} />} />
      <div className={cn(KPI_FIG, 'text-evb-bright')}>{buildTimes.totalProduction ?? '—'}</div>
    </KpiTile>
  );
}

export function CockpitKpis({
  structure,
  marginMode,
  setMarginMode,
}: {
  structure: BlueprintStructure;
  marginMode: MarginMode;
  setMarginMode: (m: MarginMode) => void;
}) {
  const { pricing, seeded, refreshing } = useMarketData();
  const { runs } = usePlannerConfig();
  const { buildTimes } = useBuildPlan();
  const { buildCharacter, skillTimeFactors } = useBuildCharacter();
  const {
    location,
    reactionSystem,
    reactionNetAvailable,
    structureFactors,
  } = useBuildSetup();

  const margin = cockpitMarginView(
    pricing,
    structure.activityId,
    location,
    reactionSystem,
    reactionNetAvailable,
    marginMode,
  );

  const leverRows = timeLeverRows({
    topBlueprintTypeId: structure.blueprintTypeId,
    buildCharacterName: buildCharacter?.name ?? null,
    skillTimeFactors,
    structureTeFactorOf: structureFactors.structureTeFactorOf,
  });

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 cockpit:grid-cols-6">
      <InputCostTile />
      <SellTile />
      <NetMarginTile
        view={margin}
        pricing={pricing}
        seeded={seeded}
        refreshing={refreshing}
        setMarginMode={setMarginMode}
      />
      <MarketScorePanel structure={structure} />
      <BuildTimeTile runs={runs} buildTimes={buildTimes} leverRows={leverRows} />
      <TotalJobTile buildTimes={buildTimes} />
    </div>
  );
}

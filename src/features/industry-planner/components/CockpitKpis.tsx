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
import { timeLeverRows } from '../time-lever-rows';
import { marginToneClass, type RegionalDiscountCallout } from '../industry-styles';
import type { BlueprintPricing, BlueprintStructure, NetMarginView } from '../types';
import { FeeBreakdownPanel } from './FeeBreakdownPanel';
import { KpiHead, KpiHelp, KpiTile, KPI_FIG, SimpleTile } from './kpi-tile';
import { LoadFailed } from './LoadFailed';
import { MarketScorePanel } from './MarketScorePanel';
import { useBuildPlan, useBuildSetup, useMarketData, usePlannerConfig } from './planner-contexts';

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
      <p className="max-w-[240px] text-ui leading-snug text-muted">
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
            <RawItemToggle basis={costBasis} setBasis={setCostBasis} />
            <InputCostHelp bases={view.bases} />
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
      <p className="max-w-[240px] text-ui leading-snug text-muted">
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

function FeeHover({
  net,
  systemName,
  nameOf,
}: {
  net: NetMarginView;
  systemName: string | undefined;
  nameOf: (typeId: number) => string;
}) {
  // Wide enough that an indented line such as an assumed facility tax reads in full.
  return (
    <KpiHelp label="Fee breakdown" keepSide className="w-[296px]">
      <FeeBreakdownPanel net={net} systemName={systemName} nameOf={nameOf} />
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
      <p className="text-ui leading-snug text-muted">
        Sequential — one job at a time. TE, structure and skills applied per job; parallel slots
        not counted.
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
  nameOf,
}: {
  nameOf: (typeId: number) => string;
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
            <GrossNetToggle showNet={view.showNet} netAvailable={view.netAvailable} setMode={setMarginMode} />
            {view.net && <FeeHover net={view.net} systemName={view.feeSystemName} nameOf={nameOf} />}
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

/** A tile that takes the rail's full width, and one column of three in between. */
const WIDE = 'col-span-2 sm:col-span-1 lg:col-span-2 *:h-full';

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
  const { buildTimes, skillTimeFactors } = useBuildPlan();
  const { location, reactionSystem, reactionNetAvailable, structureFactors, profile, profilePlan, locationFailed, retryLocation } =
    useBuildSetup();
  const builder = profile?.document.members.find((m) => m.characterId === profilePlan?.top.characterId);

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
    buildCharacterName: builder?.name ?? null,
    skillTimeFactors,
    structureTeFactorOf: structureFactors.structureTeFactorOf,
  });

  return (
    <div className="reveal reveal-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
      <div className={WIDE}>
        <InputCostTile />
      </div>
      <div className={WIDE}>
        <SellTile />
      </div>
      {locationFailed && (
        <LoadFailed
          className="col-span-full"
          title="System fees didn't load"
          detail="Net margin is unavailable"
          retryLabel="Retry system fees"
          onRetry={retryLocation}
        />
      )}
      <div className={WIDE}>
        <NetMarginTile
          view={margin}
          pricing={pricing}
          seeded={seeded}
          refreshing={refreshing}
          setMarginMode={setMarginMode}
          nameOf={(typeId) => structure.buildNodeDisplay[typeId]?.name ?? structure.materialNames[typeId] ?? `Type ${typeId}`}
        />
      </div>
      <div className={WIDE}>
        <MarketScorePanel structure={structure} />
      </div>
      <BuildTimeTile runs={runs} buildTimes={buildTimes} leverRows={leverRows} />
      <TotalJobTile buildTimes={buildTimes} />
    </div>
  );
}

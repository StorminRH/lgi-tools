'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { scrollArea } from '@/components/ui/scroll-area';
import { LivePrice } from '@/components/ui/live-price';
import { nodeImage } from '@/data/eve-data/type-images';
import { formatIsk } from '@/lib/format/isk';
import { chainActualsFrom } from '../build-batch';
import {
  isEfficiencyEligible,
  levelAt,
  tierColumnView,
  unitPriceMap,
  type TierRowView,
} from '../build-plan-view';
import {
  chainLevelsFrom,
  consolidateBuild,
  scaleTiersToBatched,
  type ConsolidatedItem,
  type ConsolidatedTier,
} from '../build-consolidate';
import { nodeFrameState } from '../node-frame-state';
import type { AssetHolding, BlueprintStructure, OwnedAssetEntry, OwnedComponentDetail } from '../types';
import { CockpitRawLedger } from './CockpitRawLedger';
import { NodeAdjusters } from './MeAdjuster';
import { NodeCard, type NodeEfficiency } from './NodeCard';
import { useBuildPlan, useMarketData } from './planner-contexts';

const COLS_TABLET = ['', 'sm:grid-cols-1', 'sm:grid-cols-2'];
/** Tiers run left to right at a readable width, scrolling sideways when the tree is deeper than the page. */
const TIER_STRIP =
  'cockpit:grid-flow-col cockpit:grid-cols-none cockpit:auto-cols-[minmax(15rem,1fr)] cockpit:overflow-x-auto cockpit:snap-x cockpit:pb-2';

interface Focus {
  depth: number;
  typeId: number;
  name: string;
}

function TierRow({
  item,
  icon,
  qty,
  value,
  efficiency,
  detail,
  ownedQty,
  heldBy,
  selected,
  related,
  faded,
  onSelect,
}: {
  item: ConsolidatedItem;
  icon: ReturnType<typeof nodeImage>;
  qty: number;
  value: number | null;
  efficiency?: NodeEfficiency;
  detail?: OwnedComponentDetail;
  ownedQty?: number;
  heldBy?: AssetHolding[];
  selected: boolean;
  related: boolean;
  faded: boolean;
  onSelect?: () => void;
}) {
  return (
    <NodeCard
      typeId={item.typeId}
      icon={icon}
      name={item.name}
      label={item.label}
      qty={qty}
      value={value}
      efficiency={efficiency}
      detail={detail}
      ownedQty={ownedQty}
      heldBy={heldBy}
      selected={selected}
      related={related}
      faded={faded}
      onSelect={onSelect}
    />
  );
}

function TierRowSlot({
  row,
  depth,
  iconFor,
  efficiencyFor,
  detailFor,
  ownedAssetFor,
  onToggle,
}: {
  row: TierRowView;
  depth: number;
  iconFor: (typeId: number) => ReturnType<typeof nodeImage>;
  efficiencyFor?: (typeId: number, name: string) => NodeEfficiency | undefined;
  detailFor: (typeId: number) => OwnedComponentDetail | undefined;
  ownedAssetFor: (typeId: number) => OwnedAssetEntry | undefined;
  onToggle: (depth: number, item: ConsolidatedItem) => void;
}) {
  const { item } = row;
  const { ownedQty, heldBy } = ownedAssetFor(item.typeId) ?? {};
  return (
    <TierRow
      item={item}
      icon={iconFor(item.typeId)}
      qty={row.qty}
      value={row.value}
      efficiency={efficiencyFor?.(item.typeId, item.name)}
      detail={detailFor(item.typeId)}
      ownedQty={ownedQty}
      heldBy={heldBy}
      selected={row.selected}
      related={row.related}
      faded={row.faded}
      onSelect={item.hasChildren ? () => onToggle(depth, item) : undefined}
    />
  );
}

function TierColumn({
  tier,
  unitPriceOf,
  iconFor,
  efficiencyFor,
  detailFor,
  ownedAssetFor,
  focus,
  inChain,
  actualLevel,
  refreshing,
  onToggle,
}: {
  tier: ConsolidatedTier;
  unitPriceOf: Map<number, number | null>;
  iconFor: (typeId: number) => ReturnType<typeof nodeImage>;
  efficiencyFor?: (typeId: number, name: string) => NodeEfficiency | undefined;
  detailFor: (typeId: number) => OwnedComponentDetail | undefined;
  ownedAssetFor: (typeId: number) => OwnedAssetEntry | undefined;
  focus: Focus | null;
  inChain: Set<number> | null;
  actualLevel: Map<number, number> | null;
  refreshing: boolean;
  onToggle: (depth: number, item: ConsolidatedItem) => void;
}) {
  const { rows, subtotal } = tierColumnView(tier, { focus, inChain, actualLevel, unitPriceOf });
  return (
    <div className="min-w-0 snap-start">
      <div className="mb-2 flex items-center gap-2 whitespace-nowrap text-label font-semibold uppercase tracking-eyebrow text-muted">
        Tier {tier.depth}
        <span className="text-faint">· {tier.items.length}</span>
        <span className="h-0 flex-1 border-b border-dotted border-border-idle" />
        <LivePrice
          value={formatIsk(subtotal)}
          pending={refreshing}
          className="text-ui font-semibold tracking-normal text-isk"
        />
      </div>
      <Card>
        {rows.map((row) => (
          <TierRowSlot
            key={row.item.typeId}
            row={row}
            depth={tier.depth}
            iconFor={iconFor}
            efficiencyFor={efficiencyFor}
            detailFor={detailFor}
            ownedAssetFor={ownedAssetFor}
            onToggle={onToggle}
          />
        ))}
      </Card>
    </div>
  );
}

function TraceMeta({ focus, onClear }: { focus: Focus; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 text-ui text-muted">
      <Button
        variant="bare"
        type="button"
        onClick={onClear}
        className="cursor-pointer uppercase tracking-wide text-muted hover:text-name"
      >
        ✕ Clear
      </Button>
      <span>
        Tracing <span className="text-name">{focus.name}</span> down its chain
      </span>
    </span>
  );
}

export function CockpitBuildPlan({ structure, ledgerOpen }: { structure: BlueprintStructure; ledgerOpen: boolean }) {
  const { pricing, refreshing } = useMarketData();
  const {
    ownedMe,
    ownedDetail,
    ownedAssets,
    meOverrides,
    setMeOverride,
    resetMeOverride,
    ownedTe,
    teOverrides,
    setTeOverride,
    resetTeOverride,
    ledger,
  } = useBuildPlan();
  const { tiers, childrenOf } = useMemo(() => consolidateBuild(structure), [structure]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const blueprintOf = (typeId: number) => ledger.builds.get(typeId)?.blueprintTypeId;
  const iconFor = (typeId: number) => nodeImage(blueprintOf(typeId), typeId);
  const efficiencyFor = (typeId: number, name: string): NodeEfficiency | undefined => {
    const bp = blueprintOf(typeId);
    if (!isEfficiencyEligible(bp, structure.buildNodeDisplay[typeId]?.label)) {
      return undefined;
    }
    return {
      state: nodeFrameState(bp, ownedMe, ownedTe, meOverrides, teOverrides),
      adjusters: (
        <NodeAdjusters
          blueprintTypeId={bp}
          name={name}
          ownedMe={ownedMe}
          meOverrides={meOverrides}
          setMeOverride={setMeOverride}
          resetMeOverride={resetMeOverride}
          ownedTe={ownedTe}
          teOverrides={teOverrides}
          setTeOverride={setTeOverride}
          resetTeOverride={resetTeOverride}
        />
      ),
    };
  };
  const detailFor = (typeId: number) => {
    const bp = blueprintOf(typeId);
    return bp !== undefined ? ownedDetail?.get(bp) : undefined;
  };
  const ownedAssetFor = (typeId: number): OwnedAssetEntry | undefined => ownedAssets?.get(typeId);
  const batchedTiers = useMemo(() => scaleTiersToBatched(tiers, ledger), [tiers, ledger]);
  const chainActuals = useMemo(
    () => (focus ? chainActualsFrom(structure.tree, focus.typeId, ledger) : null),
    [focus, structure.tree, ledger],
  );

  const unitPriceOf = useMemo(() => unitPriceMap(pricing), [pricing]);

  const chainLevels = useMemo(
    () => (focus ? chainLevelsFrom(focus.typeId, childrenOf) : null),
    [focus, childrenOf],
  );

  const toggleFocus = (depth: number, item: ConsolidatedItem) =>
    setFocus((prev) =>
      prev && prev.typeId === item.typeId && prev.depth === depth
        ? null
        : { depth, typeId: item.typeId, name: item.name },
    );

  if (tiers.length === 0) {
    return (
      <div className="reveal reveal-3">
        <Card>
          <p className="px-3.5 py-3 text-ui text-muted">
            No build breakdown — this blueprint has no resolved inputs yet.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="reveal reveal-3">
      {focus && (
        <div className="mb-3.5">
          <TraceMeta focus={focus} onClear={() => setFocus(null)} />
        </div>
      )}

      {ledgerOpen && (
        <div className="mb-5">
          <CockpitRawLedger
            pricing={pricing}
            structure={structure}
            refreshing={refreshing}
          />
        </div>
      )}

      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4',
          COLS_TABLET[Math.min(batchedTiers.length, 2)],
          scrollArea,
          TIER_STRIP,
        )}
      >
        {batchedTiers.map((tier) => (
          <TierColumn
            key={tier.depth}
            tier={tier}
            unitPriceOf={unitPriceOf}
            iconFor={iconFor}
            efficiencyFor={efficiencyFor}
            detailFor={detailFor}
            ownedAssetFor={ownedAssetFor}
            focus={focus}
            inChain={levelAt(chainLevels, focus, tier.depth)}
            actualLevel={levelAt(chainActuals, focus, tier.depth)}
            refreshing={refreshing}
            onToggle={toggleFocus}
          />
        ))}
      </div>
    </div>
  );
}

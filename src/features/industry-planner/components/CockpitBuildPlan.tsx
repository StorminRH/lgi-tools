'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { nodeImage } from '@/data/eve-data/type-images';
import { formatIsk } from '@/lib/format/isk';
import { isEfficiencyEligible, tierColumnView, unitPriceMap, type TierRowView } from '../build-plan-view';
import {
  consolidateBuild,
  scaleTiersToBatched,
  type ConsolidatedItem,
  type ConsolidatedTier,
} from '../build-consolidate';
import { nodeFrameState } from '../node-frame-state';
import type { AssetHolding, BlueprintStructure, OwnedAssetEntry, OwnedComponentDetail } from '../types';
import { NodeAdjusters } from './MeAdjuster';
import { NodeCard, type NodeEfficiency } from './NodeCard';
import { useBuildPlan, useMarketData } from './planner-contexts';
import { useSettledHover } from './use-settled-hover';

const COLS_TABLET = ['', 'sm:grid-cols-1', 'sm:grid-cols-2'];
/**
 * Every tier shares the page, as many columns as the tree is deep, down to
 * the narrowest column a card still reads in; a tree deeper than that
 * scrolls sideways instead of crushing its cards.
 */
const COLS_DESKTOP = [
  '',
  'cockpit:grid-cols-[repeat(1,minmax(8rem,1fr))]',
  'cockpit:grid-cols-[repeat(2,minmax(8rem,1fr))]',
  'cockpit:grid-cols-[repeat(3,minmax(8rem,1fr))]',
  'cockpit:grid-cols-[repeat(4,minmax(8rem,1fr))]',
  'cockpit:grid-cols-[repeat(5,minmax(8rem,1fr))]',
  'cockpit:grid-cols-[repeat(6,minmax(8rem,1fr))]',
  'cockpit:grid-cols-[repeat(7,minmax(8rem,1fr))]',
  'cockpit:grid-cols-[repeat(8,minmax(8rem,1fr))]',
];

function TierRow({
  item,
  icon,
  qty,
  value,
  efficiency,
  detail,
  ownedQty,
  heldBy,
  lit,
  dimmed,
  onOpen,
  onHover,
}: {
  item: ConsolidatedItem;
  icon: ReturnType<typeof nodeImage>;
  qty: number;
  value: number | null;
  efficiency?: NodeEfficiency;
  detail?: OwnedComponentDetail;
  ownedQty?: number;
  heldBy?: AssetHolding[];
  lit: boolean;
  dimmed: boolean;
  onOpen?: () => void;
  onHover?: (entering: boolean) => void;
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
      lit={lit}
      dimmed={dimmed}
      onOpen={onOpen}
      onHover={onHover}
    />
  );
}

interface RowHandlers {
  iconFor: (typeId: number) => ReturnType<typeof nodeImage>;
  efficiencyFor?: (typeId: number, name: string) => NodeEfficiency | undefined;
  detailFor: (typeId: number) => OwnedComponentDetail | undefined;
  ownedAssetFor: (typeId: number) => OwnedAssetEntry | undefined;
  onOpen: (typeId: number) => void;
  onHover: (typeId: number, entering: boolean) => void;
}

function TierRowSlot({ row, handlers }: { row: TierRowView; handlers: RowHandlers }) {
  const { iconFor, efficiencyFor, detailFor, ownedAssetFor, onOpen, onHover } = handlers;
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
      lit={row.lit}
      dimmed={row.dimmed}
      onOpen={item.hasChildren ? () => onOpen(item.typeId) : undefined}
      onHover={(entering) => onHover(item.typeId, entering)}
    />
  );
}

function TierColumn({
  tier,
  unitPriceOf,
  lit,
  refreshing,
  handlers,
}: {
  tier: ConsolidatedTier;
  unitPriceOf: Map<number, number | null>;
  lit: ReadonlySet<number> | null;
  refreshing: boolean;
  handlers: RowHandlers;
}) {
  const { rows, subtotal } = tierColumnView(tier, { unitPriceOf, lit });
  return (
    <div className="@container min-w-0">
      {/* A narrow column stacks its subtotal under the tier name, so every column's cards start level. */}
      <div className="mb-2 flex items-center gap-x-2 whitespace-nowrap text-label font-semibold uppercase tracking-eyebrow text-muted @max-[14rem]:flex-col @max-[14rem]:items-start">
        <span className="flex items-center gap-2">
          Tier {tier.depth}
          <span className="text-faint">· {tier.items.length}</span>
        </span>
        <span className="h-0 flex-1 border-b border-dotted border-border-idle @max-[14rem]:hidden" />
        <LivePrice
          value={formatIsk(subtotal)}
          pending={refreshing}
          className="text-ui font-semibold tracking-normal text-isk"
        />
      </div>
      <Card>
        {rows.map((row) => (
          <TierRowSlot key={row.item.typeId} row={row} handlers={handlers} />
        ))}
      </Card>
    </div>
  );
}

/**
 * The build by tier. Pointing at a buildable lights it and everything that
 * goes into it; opening one hands it to the component drawer.
 */
export function CockpitBuildPlan({
  structure,
  onOpen,
}: {
  structure: BlueprintStructure;
  onOpen: (typeId: number) => void;
}) {
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
  const { tiers, descendants } = useMemo(() => consolidateBuild(structure), [structure]);
  const [hovered, onHover] = useSettledHover();
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
  const unitPriceOf = useMemo(() => unitPriceMap(pricing), [pricing]);
  const lit = useMemo(
    () => (hovered === null ? null : new Set([hovered, ...(descendants.get(hovered) ?? [])])),
    [hovered, descendants],
  );
  const handlers: RowHandlers = {
    iconFor,
    efficiencyFor,
    detailFor,
    ownedAssetFor,
    onOpen,
    onHover,
  };

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
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4 cockpit:gap-3 cockpit:overflow-x-auto',
          COLS_TABLET[Math.min(batchedTiers.length, 2)],
          COLS_DESKTOP[Math.min(batchedTiers.length, 8)],
        )}
      >
        {batchedTiers.map((tier) => (
          <TierColumn
            key={tier.depth}
            tier={tier}
            unitPriceOf={unitPriceOf}
            lit={lit}
            refreshing={refreshing}
            handlers={handlers}
          />
        ))}
      </div>
    </div>
  );
}

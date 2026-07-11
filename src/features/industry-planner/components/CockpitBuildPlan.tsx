'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionLabel } from '@/components/ui/section-label';
import { formatIsk } from '@/lib/format/isk';
import { chainActualsFrom } from '../build-batch';
import {
  isEfficiencyEligible,
  levelAt,
  tierColumnView,
  unitPriceMap,
  type TierRowView,
} from '../build-plan-view';
import { batchedCostOfRows } from '../cost-basis-view';
import {
  chainLevelsFrom,
  consolidateBuild,
  scaleTiersToBatched,
  type ConsolidatedItem,
  type ConsolidatedTier,
} from '../build-consolidate';
import { nodeIcon } from '../industry-styles';
import { nodeFrameState } from '../node-frame-state';
import type { AssetHolding, BlueprintStructure, OwnedAssetEntry, OwnedComponentDetail } from '../types';
import { CockpitRawLedger } from './CockpitRawLedger';
import { NodeAdjusters } from './MeAdjuster';
import { MultibuyPanel } from './MultibuyPanel';
import { NodeCard, type NodeEfficiency } from './NodeCard';
import { usePricing } from './PricingProvider';

// The Cockpit build plan: the consolidated material breakdown as a column per
// depth tier. Each row shows the WHOLE-RUN BATCHED quantity (the build-batch
// ceil, runs baked in) over its market value; each tier carries a dotted leader
// to its ISK subtotal. A collapsible raw-materials ledger sits above the tiers
// (CockpitRawLedger): collapsed it's the recursed build-vs-buy grand total,
// expanding to the by-type bill. Clicking a buildable lights its downstream chain
// across the columns — a state-driven highlight, never an expand. Replaces the
// legacy multi-view build plan.

// All build tiers share ONE horizontal row on desktop — the columns scale down to
// fit however many build depths a blueprint has (up to 7 for the deepest
// capitals). Static class maps (indexed by tier count) so Tailwind's JIT emits
// them: a 2-column layout on tablets, a single column on mobile. The breakpoints
// are arbitrary `min-[…]` consistently — mixing a named `sm:` with `min-[1080px]:`
// flips Tailwind's cascade order so the wider one loses.
const COLS_TABLET = ['', 'min-[640px]:grid-cols-1', 'min-[640px]:grid-cols-2'];
const COLS_DESKTOP = [
  '',
  'min-[1080px]:grid-cols-1',
  'min-[1080px]:grid-cols-2',
  'min-[1080px]:grid-cols-3',
  'min-[1080px]:grid-cols-4',
  'min-[1080px]:grid-cols-5',
  'min-[1080px]:grid-cols-6',
  'min-[1080px]:grid-cols-7',
  'min-[1080px]:grid-cols-8',
];

interface Focus {
  depth: number;
  typeId: number;
  name: string;
}

// A build-plan row is the re-laid-out node card (3.7.5.8). `efficiency` carries the
// icon-frame tone + popover adjusters for a manufacturable buildable (absent only for
// raws/reactions); `detail` is the owned blueprint's owner/location shown in the icon
// popover (not the QTY ring). Clicking drills the cascade when the node has children.
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
  // The rendition this node's icon shows (producing `bp` for a buildable, the
  // item `icon` for a raw).
  icon: ReturnType<typeof nodeIcon>;
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

// One tier row wired to the caller's per-node closures: the icon rendition, the
// efficiency adjusters, the owner detail, and the on-hand assets for its QTY ring.
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
  iconFor: (typeId: number) => ReturnType<typeof nodeIcon>;
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
  onToggle,
}: {
  tier: ConsolidatedTier;
  unitPriceOf: Map<number, number | null>;
  // The rendition each node's icon shows — the producing blueprint/formula `bp`
  // for a buildable, the item `icon` for a raw.
  iconFor: (typeId: number) => ReturnType<typeof nodeIcon>;
  // The per-node ME/TE adjusters + icon-frame state for a buildable row; undefined
  // for raws/reactions (a plain, frameless icon).
  efficiencyFor?: (typeId: number, name: string) => NodeEfficiency | undefined;
  // The owner/location for a node's icon popover (owned buildables only).
  detailFor: (typeId: number) => OwnedComponentDetail | undefined;
  // The caller's on-hand quantity + holdings for a node's QTY ring / asset ledger.
  ownedAssetFor: (typeId: number) => OwnedAssetEntry | undefined;
  focus: Focus | null;
  inChain: Set<number> | null;
  actualLevel: Map<number, number> | null;
  onToggle: (depth: number, item: ConsolidatedItem) => void;
}) {
  // `tier` carries whole-run batched quantities (runs already baked in by
  // scaleTiersToBatched); tierColumnView decides which cells the drill-down lights
  // and their displayed quantity/value, and sums the subtotal from the visible
  // rows so the column header always equals the sum of what it shows.
  const { rows, subtotal } = tierColumnView(tier, { focus, inChain, actualLevel, unitPriceOf });
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted">
        Tier {tier.depth}
        <span className="text-faint">· {tier.items.length}</span>
        <span className="h-0 flex-1 border-b border-dotted border-border-idle" />
        <span className="text-ui font-semibold tabular-nums tracking-normal text-isk">
          {formatIsk(subtotal)}
        </span>
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

function TraceMeta({ focus, onClear }: { focus: Focus | null; onClear: () => void }) {
  if (!focus) {
    return (
      <span className="font-mono text-ui text-muted">
        Consolidated · by tier · click a ▸ component to trace its sub-tree
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 font-mono text-ui text-muted">
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer uppercase tracking-[0.12em] text-muted hover:text-name"
      >
        ✕ Clear
      </button>
      <span>
        Tracing <span className="text-name">{focus.name}</span> down its chain
      </span>
    </span>
  );
}

// The raw-ledger toggle (styled like the section label): the recursed build-vs-buy
// grand total, expanding the by-type bill below.
function RawLedgerToggle({
  grandTotal,
  open,
  onToggle,
}: {
  grandTotal: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group inline-flex cursor-pointer items-baseline gap-2"
    >
      <span className="inline-flex items-baseline gap-2 font-mono text-caption font-semibold uppercase tracking-[0.16em] text-muted group-hover:text-name">
        <span className="tracking-normal text-isk">{'//'}</span>
        Raw ledger
      </span>
      <span className="font-mono text-caption font-semibold tabular-nums text-isk">
        {grandTotal !== null ? formatIsk(grandTotal) : '—'}
      </span>
      <span className={cn('inline-block text-micro text-muted transition-transform', open && 'rotate-180')}>
        ▾
      </span>
    </button>
  );
}

export function CockpitBuildPlan({ structure }: { structure: BlueprintStructure }) {
  const {
    pricing,
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
    // The whole-run batch ledger (the build-batch ceil) — computed once in the
    // provider and shared, so the tiers, the drill-down, and the build-time totals
    // read one ME source. Byte-identical to the ME0 basis when nothing is owned.
    ledger,
  } = usePricing();
  const { tiers, childrenOf } = useMemo(() => consolidateBuild(structure), [structure]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  // The producing blueprint per buildable typeId — keys each row's adjusters to the
  // override maps. Undefined for raws (which never appear as tier rows).
  const blueprintOf = (typeId: number) => ledger.builds.get(typeId)?.blueprintTypeId;
  // Each node's icon: a buildable/reaction shows the icon of WHAT YOU RUN — its
  // producing blueprint or reaction formula (both serve the `bp` rendition) —
  // while a raw keeps the item's own icon. `ledger.builds` is derived from the
  // tree (no price dependency), so this is stable on the first render.
  const iconFor = (typeId: number) => nodeIcon(blueprintOf(typeId), typeId);
  // The per-node icon-frame tone + popover adjusters for a buildable row — every
  // manufacturable buildable (owned, manual, or unowned), so the what-if is always
  // available behind the icon. The frame tone is the combined ME/TE state; the popover
  // holds the two labelled fields. An unowned node's fields default to ME/TE 0, so cost
  // + build-time stay byte-identical until edited. Raws (no blueprint) and reactions
  // (can't be researched) get none → a plain, frameless icon.
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
  // The owned blueprint's owner/location for a node's icon popover (owned buildables).
  const detailFor = (typeId: number) => {
    const bp = blueprintOf(typeId);
    return bp !== undefined ? ownedDetail?.get(bp) : undefined;
  };
  // The caller's on-hand quantity + holdings for a node's QTY ring / asset ledger.
  // Keyed by the material/product typeId directly — assets are the item itself, not
  // its blueprint (no blueprintOf indirection). undefined → the owns-none placeholders.
  const ownedAssetFor = (typeId: number): OwnedAssetEntry | undefined => ownedAssets?.get(typeId);
  // Re-base the tier quantities onto the whole-run batch totals — what a builder
  // actually makes and buys. Placement and the trace graph (childrenOf) untouched.
  const batchedTiers = useMemo(() => scaleTiersToBatched(tiers, ledger), [tiers, ledger]);
  // When a buildable is focused, the ACTUAL (marginal) demand its build consumes
  // at each relative depth — the lit downstream cells show this instead of the
  // whole-run batch. Null when nothing is focused.
  const chainActuals = useMemo(
    () => (focus ? chainActualsFrom(structure.tree, focus.typeId, ledger) : null),
    [focus, structure.tree, ledger],
  );

  // Unit market price per type (raws at best buy, intermediates at best sell) —
  // built in build-plan-view so the map logic is tested.
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
      <div className="mt-7">
        <SectionLabel>Build plan</SectionLabel>
        <p className="mt-3 text-ui text-muted">
          No build breakdown — this blueprint has no resolved inputs yet.
        </p>
      </div>
    );
  }

  // The ledger's own total — the batched rows it expands to, NOT the summary's
  // inputCost: under the Item basis (3.7.21.1) the summary is the marginal
  // figure while this table stays the physical Raw buy list, and the header
  // must sum to the list it opens.
  const grandTotal = pricing ? batchedCostOfRows(pricing.rows) : null;

  return (
    <div className="mt-7">
      {/* Header: the section label + trace meta on the left; the raw-ledger
          toggle (styled like the label) on the right, expanding the by-type
          ledger below. */}
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <SectionLabel>Build plan</SectionLabel>
          <TraceMeta focus={focus} onClear={() => setFocus(null)} />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <MultibuyPanel structure={structure} />
          <RawLedgerToggle
            grandTotal={grandTotal}
            open={ledgerOpen}
            onToggle={() => setLedgerOpen((o) => !o)}
          />
        </div>
      </div>

      {ledgerOpen && (
        <div className="mb-5">
          <CockpitRawLedger pricing={pricing} structure={structure} />
        </div>
      )}

      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4',
          COLS_TABLET[Math.min(batchedTiers.length, 2)],
          COLS_DESKTOP[Math.min(batchedTiers.length, 8)],
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
            onToggle={toggleFocus}
          />
        ))}
      </div>
    </div>
  );
}

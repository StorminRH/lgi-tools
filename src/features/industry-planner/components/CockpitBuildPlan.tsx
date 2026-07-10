'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionLabel } from '@/components/ui/section-label';
import { formatIsk } from '@/lib/format/isk';
import { chainActualsFrom } from '../build-batch';
import { batchedCostOfRows } from '../cost-basis-view';
import {
  chainLevelsFrom,
  consolidateBuild,
  scaleTiersToBatched,
  type ConsolidatedItem,
  type ConsolidatedTier,
} from '../build-consolidate';
import { nodeIcon, REACTION_NODE_LABEL } from '../industry-styles';
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
  // scaleTiersToBatched). A focused drill-down swaps the lit downstream cells'
  // displayed quantity for the ACTUAL consumed amount (chainActualsFrom). The
  // subtotal sums each row's DISPLAYED value, so the column header always equals
  // the sum of its visible rows — batched when unfocused, the same actual/batched
  // mix the rows show when a drill-down is active.
  const valueOf = (typeId: number, qty: number): number | null => {
    const unit = unitPriceOf.get(typeId) ?? null;
    return unit !== null ? qty * unit : null;
  };
  // A lit downstream cell shows what the focused build actually consumes
  // (marginal); every other cell shows the whole-run batch.
  const displayQtyOf = (item: ConsolidatedItem): number => {
    const selected = !!focus && focus.typeId === item.typeId && focus.depth === tier.depth;
    const related = !selected && (inChain?.has(item.typeId) ?? false);
    return (related ? actualLevel?.get(item.typeId) : undefined) ?? item.quantity;
  };
  const subtotal = tier.items.reduce(
    (sum, item) => sum + (valueOf(item.typeId, displayQtyOf(item)) ?? 0),
    0,
  );

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 whitespace-nowrap font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">
        Tier {tier.depth}
        <span className="text-faint">· {tier.items.length}</span>
        <span className="h-0 flex-1 border-b border-dotted border-border-idle" />
        <span className="text-[11px] font-semibold tabular-nums tracking-normal text-isk">
          {formatIsk(subtotal)}
        </span>
      </div>
      <Card>
        {tier.items.map((item) => {
          const selected = !!focus && focus.typeId === item.typeId && focus.depth === tier.depth;
          const related = !selected && (inChain?.has(item.typeId) ?? false);
          const faded = !!focus && !selected && !related;
          const qty = displayQtyOf(item);
          const asset = ownedAssetFor(item.typeId);
          return (
            <TierRow
              key={item.typeId}
              item={item}
              icon={iconFor(item.typeId)}
              qty={qty}
              value={valueOf(item.typeId, qty)}
              efficiency={efficiencyFor?.(item.typeId, item.name)}
              detail={detailFor(item.typeId)}
              ownedQty={asset?.ownedQty}
              heldBy={asset?.heldBy}
              selected={selected}
              related={related}
              faded={faded}
              onSelect={item.hasChildren ? () => onToggle(tier.depth, item) : undefined}
            />
          );
        })}
      </Card>
    </div>
  );
}

function TraceMeta({ focus, onClear }: { focus: Focus | null; onClear: () => void }) {
  if (!focus) {
    return (
      <span className="font-mono text-[10px] text-muted">
        Consolidated · by tier · click a ▸ component to trace its sub-tree
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] text-muted">
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
    if (bp === undefined || structure.buildNodeDisplay[typeId]?.label === REACTION_NODE_LABEL) {
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

  // Unit market price per type: raws at best buy (the cost basis), buildable
  // intermediates at best sell (the build-vs-buy acquisition price). A type is
  // either a raw or a buildable, so the keys never collide.
  const unitPriceOf = useMemo(() => {
    const m = new Map<number, number | null>();
    if (pricing) {
      for (const r of pricing.rows) m.set(r.typeId, r.unitBuy);
      for (const ip of pricing.intermediatePrices) m.set(ip.typeId, ip.bestSell ?? ip.bestBuy);
    }
    return m;
  }, [pricing]);

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
        <p className="mt-3 text-[11px] text-muted">
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
          <button
            type="button"
            onClick={() => setLedgerOpen((o) => !o)}
            aria-expanded={ledgerOpen}
            className="group inline-flex cursor-pointer items-baseline gap-2"
          >
            <span className="inline-flex items-baseline gap-2 font-mono text-caption font-semibold uppercase tracking-[0.16em] text-muted group-hover:text-name">
              <span className="tracking-normal text-isk">{'//'}</span>
              Raw ledger
            </span>
            <span className="font-mono text-caption font-semibold tabular-nums text-isk">
              {grandTotal !== null ? formatIsk(grandTotal) : '—'}
            </span>
            <span
              className={cn(
                'inline-block text-[10px] text-muted transition-transform',
                ledgerOpen && 'rotate-180',
              )}
            >
              ▾
            </span>
          </button>
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
            inChain={focus && chainLevels ? (chainLevels.get(tier.depth - focus.depth) ?? null) : null}
            actualLevel={focus && chainActuals ? (chainActuals.get(tier.depth - focus.depth) ?? null) : null}
            onToggle={toggleFocus}
          />
        ))}
      </div>
    </div>
  );
}

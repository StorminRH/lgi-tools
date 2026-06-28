'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionLabel } from '@/components/ui/section-label';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import { chainActualsFrom, computeBatchLedgerWithMe } from '../build-batch';
import {
  chainLevelsFrom,
  consolidateBuild,
  scaleTiersToBatched,
  type ConsolidatedItem,
  type ConsolidatedTier,
} from '../build-consolidate';
import { REACTION_NODE_LABEL } from '../industry-styles';
import { effectiveMeOf } from '../me-overrides';
import type { BlueprintStructure } from '../types';
import { CockpitRawLedger } from './CockpitRawLedger';
import { MeRowOrb, TeRowOrb } from './MeAdjuster';
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

const ROW =
  'grid grid-cols-[30px_minmax(0,1fr)_auto_14px] items-center gap-2.5 px-3 py-[9px] min-h-[44px] border-t border-border-soft first:border-t-0 transition-opacity';

interface Focus {
  depth: number;
  typeId: number;
  name: string;
}

// A deep input's marginal share of one end product can be sub-unit.
function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return formatQuantity(quantity);
}

function TierRow({
  item,
  qty,
  value,
  orb,
  selected,
  related,
  faded,
  onSelect,
}: {
  item: ConsolidatedItem;
  qty: number;
  value: number | null;
  // The per-node ME adjuster (a corner gem orb), or absent when the plan isn't
  // ME-active (logged out / owns nothing) — then the row is byte-identical to the
  // pre-ME plan.
  orb?: ReactNode;
  selected: boolean;
  related: boolean;
  faded: boolean;
  onSelect?: () => void;
}) {
  const inner = (
    <>
      <TypeIcon typeId={item.typeId} size={30} mono={item.name.slice(0, 2)} />
      <div className="flex min-w-0 flex-col gap-px">
        <span className="line-clamp-2 break-words font-mono text-[12.5px] font-medium leading-[1.28] text-name">
          {item.name}
        </span>
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
          {item.label}
        </span>
      </div>
      <span className="flex flex-col items-end gap-px text-right">
        <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted">
          × {formatNodeQty(qty)}
        </span>
        <span className="whitespace-nowrap font-mono text-[11.5px] tabular-nums text-text">
          {value !== null ? formatIsk(value) : '—'}
        </span>
      </span>
      <span className={cn('text-center text-[11px]', selected ? 'text-isk' : 'text-muted')}>
        {onSelect ? '▸' : ''}
      </span>
    </>
  );

  const cls = cn(
    ROW,
    faded && 'opacity-25',
    related && 'bg-row-related',
    selected && 'bg-isk-selected shadow-[inset_2px_0_0_var(--color-isk)]',
  );

  const rowEl = onSelect ? (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(cls, 'w-full cursor-pointer text-left hover:bg-row-hover')}
    >
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );

  // Without an adjuster the bare row renders (byte-identical to the pre-ME plan).
  // With one, the gem orb is a sibling of the row's trace button (no nested
  // buttons), so the wrapper carries the row divider and the row's own top border
  // is suppressed (it's the wrapper's first child via `first:border-t-0`).
  if (!orb) return rowEl;
  return (
    <div className="relative border-t border-border-soft first:border-t-0">
      {rowEl}
      {orb}
    </div>
  );
}

function TierColumn({
  tier,
  unitPriceOf,
  orbFor,
  focus,
  inChain,
  actualLevel,
  onToggle,
}: {
  tier: ConsolidatedTier;
  unitPriceOf: Map<number, number | null>;
  // Renders a buildable row's ME adjuster (the gem orb), or undefined when the plan
  // isn't ME-active (logged out / owns nothing) → no orbs, byte-identical rows.
  orbFor?: (typeId: number, name: string, faded: boolean) => ReactNode;
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
          return (
            <TierRow
              key={item.typeId}
              item={item}
              qty={qty}
              value={valueOf(item.typeId, qty)}
              orb={orbFor?.(item.typeId, item.name, faded)}
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
    runs,
    ownedMe,
    ownedDetail,
    meOverrides,
    setMeOverride,
    resetMeOverride,
    ownedTe,
    teOverrides,
    setTeOverride,
    resetTeOverride,
    ownedActive,
  } = usePricing();
  const { tiers, childrenOf } = useMemo(() => consolidateBuild(structure), [structure]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  // The whole-run batch ledger for `runs` runs (the build-batch ceil) — drives
  // the batched tier quantities, the focused-drill-down actuals, AND the per-node
  // ME readouts. ME-aware: each buildable reduces by the caller's owned-blueprint
  // ME. With nothing owned (`ownedMe` null/empty) `meOf` returns undefined
  // everywhere, so this is byte-identical to the ME0 cost basis.
  const ledger = useMemo(() => {
    const meOf = effectiveMeOf(ownedMe, meOverrides);
    return computeBatchLedgerWithMe(structure.tree, runs, {
      meOf,
      topBlueprintTypeId: structure.blueprintTypeId,
    });
  }, [structure.tree, structure.blueprintTypeId, runs, ownedMe, meOverrides]);
  // The producing blueprint per buildable typeId — keys each row's adjusters to the
  // override maps. Undefined for raws (which never appear as tier rows).
  const blueprintOf = (typeId: number) => ledger.builds.get(typeId)?.blueprintTypeId;
  // Render a buildable row's adjuster orbs (the ME gem + the TE hourglass) — only
  // when the plan is active (a signed-in caller owns a researched blueprint in this
  // build); otherwise no orbs → byte-identical rows. Every buildable gets them
  // (owned, manual, or unowned), so you can model a node you don't own.
  const orbFor = ownedActive
    ? (typeId: number, name: string, faded: boolean): ReactNode => {
        const bp = blueprintOf(typeId);
        // No adjuster on raws (no blueprint) or reactions (can't be researched →
        // no ME/TE to set), so orbs only sit on manufacturable components.
        if (bp === undefined || structure.buildNodeDisplay[typeId]?.label === REACTION_NODE_LABEL) {
          return null;
        }
        return (
          <>
            <MeRowOrb
              blueprintTypeId={bp}
              name={name}
              ownedMe={ownedMe}
              meOverrides={meOverrides}
              setMeOverride={setMeOverride}
              resetMeOverride={resetMeOverride}
              detail={ownedDetail?.get(bp)}
              faded={faded}
            />
            <TeRowOrb
              blueprintTypeId={bp}
              name={name}
              ownedTe={ownedTe}
              teOverrides={teOverrides}
              setTeOverride={setTeOverride}
              resetTeOverride={resetTeOverride}
              faded={faded}
            />
          </>
        );
      }
    : undefined;
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

  const grandTotal = pricing?.summary.inputCost ?? null;

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
            orbFor={orbFor}
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

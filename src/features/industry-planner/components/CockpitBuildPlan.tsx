'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionLabel } from '@/components/ui/section-label';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import { chainActualsFrom, computeBatchLedger } from '../build-batch';
import {
  chainLevelsFrom,
  consolidateBuild,
  scaleTiersToBatched,
  type ConsolidatedItem,
  type ConsolidatedTier,
} from '../build-consolidate';
import type { BlueprintStructure } from '../types';
import { CockpitRawLedger } from './CockpitRawLedger';
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
  selected,
  related,
  faded,
  onSelect,
}: {
  item: ConsolidatedItem;
  qty: number;
  value: number | null;
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
    related && 'bg-[rgba(255,255,255,0.03)]',
    selected && 'bg-[rgba(61,214,140,0.08)] shadow-[inset_2px_0_0_var(--color-isk)]',
  );

  if (!onSelect) return <div className={cls}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(cls, 'w-full cursor-pointer text-left hover:bg-[rgba(255,255,255,0.018)]')}
    >
      {inner}
    </button>
  );
}

function TierColumn({
  tier,
  unitPriceOf,
  focus,
  inChain,
  actualLevel,
  onToggle,
}: {
  tier: ConsolidatedTier;
  unitPriceOf: Map<number, number | null>;
  focus: Focus | null;
  inChain: Set<number> | null;
  actualLevel: Map<number, number> | null;
  onToggle: (depth: number, item: ConsolidatedItem) => void;
}) {
  // `tier` carries whole-run batched quantities (runs already baked in by
  // scaleTiersToBatched). The tier subtotal always reflects those batched figures;
  // a focused drill-down only swaps the lit downstream cells' displayed quantity
  // for the ACTUAL consumed amount (chainActualsFrom), never the subtotal.
  const valueOf = (typeId: number, qty: number): number | null => {
    const unit = unitPriceOf.get(typeId) ?? null;
    return unit !== null ? qty * unit : null;
  };
  const subtotal = tier.items.reduce(
    (sum, item) => sum + (valueOf(item.typeId, item.quantity) ?? 0),
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
          // A lit downstream cell shows what the focused build actually consumes
          // (marginal), not the whole-run batch the unfocused column shows.
          const actual = related ? actualLevel?.get(item.typeId) : undefined;
          const qty = actual ?? item.quantity;
          return (
            <TierRow
              key={item.typeId}
              item={item}
              qty={qty}
              value={valueOf(item.typeId, qty)}
              selected={selected}
              related={related}
              faded={!!focus && !selected && !related}
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
  const { pricing, runs } = usePricing();
  const { tiers, childrenOf } = useMemo(() => consolidateBuild(structure), [structure]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  // The whole-run batch ledger for `runs` runs (the build-batch ceil) — drives
  // both the batched tier quantities and the focused-drill-down actuals.
  const ledger = useMemo(() => computeBatchLedger(structure.tree, runs), [structure.tree, runs]);
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

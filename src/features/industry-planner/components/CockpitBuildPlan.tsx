'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionLabel } from '@/components/ui/section-label';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import {
  chainLevelsFrom,
  consolidateBuild,
  type ConsolidatedItem,
  type ConsolidatedTier,
} from '../build-consolidate';
import type { BlueprintStructure } from '../types';
import { usePricing } from './PricingProvider';

// The Cockpit build plan: the consolidated material breakdown as a column per
// depth tier. Each row shows quantity × runs over its market value; each tier
// carries a dotted leader to its ISK subtotal; the footer shows the recursed raw
// grand total (priced build-vs-buy, deliberately ≠ the sum of subtotals). Clicking
// a buildable lights its downstream chain across the columns — a state-driven
// highlight, never an expand. Replaces the legacy multi-view build plan.

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
  runs,
  unitPriceOf,
  focus,
  inChain,
  onToggle,
}: {
  tier: ConsolidatedTier;
  runs: number;
  unitPriceOf: Map<number, number | null>;
  focus: Focus | null;
  inChain: Set<number> | null;
  onToggle: (depth: number, item: ConsolidatedItem) => void;
}) {
  const valueOf = (item: ConsolidatedItem): number | null => {
    const unit = unitPriceOf.get(item.typeId) ?? null;
    return unit !== null ? item.quantity * runs * unit : null;
  };
  const subtotal = tier.items.reduce((sum, item) => sum + (valueOf(item) ?? 0), 0);

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
          return (
            <TierRow
              key={item.typeId}
              item={item}
              qty={item.quantity * runs}
              value={valueOf(item)}
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
      <SectionLabel
        className="mb-3.5"
        meta={<TraceMeta focus={focus} onClear={() => setFocus(null)} />}
      >
        Build plan
      </SectionLabel>

      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4',
          COLS_TABLET[Math.min(tiers.length, 2)],
          COLS_DESKTOP[Math.min(tiers.length, 8)],
        )}
      >
        {tiers.map((tier) => (
          <TierColumn
            key={tier.depth}
            tier={tier}
            runs={runs}
            unitPriceOf={unitPriceOf}
            focus={focus}
            inChain={focus && chainLevels ? (chainLevels.get(tier.depth - focus.depth) ?? null) : null}
            onToggle={toggleFocus}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3.5 rounded-md border border-border bg-section px-4 py-3">
        <span className="font-body text-[11px] text-muted">
          Raw materials total — intermediates priced for{' '}
          <span className="text-text">build-vs-buy</span>, not summed
        </span>
        <span className="text-[14px] font-semibold tabular-nums text-isk">
          {grandTotal !== null ? formatIsk(grandTotal) : '—'}
        </span>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format/number';
import { consolidateBuild, type ConsolidatedItem } from '../build-consolidate';
import type { BlueprintStructure } from '../types';

// The consolidated build view: a column per tier (build step below the
// product), each listing every input consumed at that depth — buildables and
// raws alike — with quantities summed across that tier. Every tier is always
// shown in a wrapping grid; clicking a buildable lights its downstream chain
// (everything else dims) without changing the layout, and clicking it again (or
// Clear) drops the highlight.

// Desktop column count for the tier grid, capped at 4. Each column scales to
// fill the width (shrinking from its 360px natural max); a 5th/6th tier wraps
// to a second row, landing under the 1st/2nd column. Static classes, indexed by
// min(tierCount, 4), so Tailwind's JIT emits them.
const TIER_GRID_COLS = [
  '',
  'xl:grid-cols-[minmax(0,360px)]',
  'xl:grid-cols-[repeat(2,minmax(0,360px))]',
  'xl:grid-cols-[repeat(3,minmax(0,360px))]',
  'xl:grid-cols-[repeat(4,minmax(0,360px))]',
];

const ROW =
  'grid grid-cols-[32px_minmax(0,1fr)_auto_12px] items-center gap-2.5 px-3.5 py-[7px] min-h-[40px] border-t border-border-soft first:border-t-0 text-[12px] transition-opacity';

// On a marginal basis a deep input's share of one end product can be sub-unit.
function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return formatQuantity(quantity);
}

function TierItem({
  item,
  selected,
  related,
  faded,
  onSelect,
}: {
  item: ConsolidatedItem;
  selected: boolean;
  related: boolean;
  faded: boolean;
  onSelect?: () => void;
}) {
  const inner = (
    <>
      <TypeIcon typeId={item.typeId} size={32} mono={item.name.slice(0, 2)} />
      <div className="min-w-0">
        <div className="truncate text-name">{item.name}</div>
        <div className="text-[9px] tracking-[0.08em] uppercase text-muted truncate">{item.label}</div>
      </div>
      <span className="text-[11px] text-muted whitespace-nowrap">× {formatNodeQty(item.quantity)}</span>
      <span className={cn('text-[11px] text-center', selected ? 'text-isk' : 'text-muted')}>
        {onSelect ? '▸' : ''}
      </span>
    </>
  );

  const cls = cn(
    ROW,
    faded && 'opacity-25',
    related && 'bg-[rgba(255,255,255,0.025)]',
    selected && 'bg-[rgba(61,214,140,0.08)] shadow-[inset_2px_0_0_var(--color-isk)]',
  );

  if (!onSelect) return <div className={cls}>{inner}</div>;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(cls, 'w-full text-left cursor-pointer hover:bg-[rgba(255,255,255,0.018)]')}
    >
      {inner}
    </button>
  );
}

interface Focus {
  depth: number;
  typeId: number;
  name: string;
}

export function ConsolidatedBuild({ structure }: { structure: BlueprintStructure }) {
  const { tiers, childrenOf } = useMemo(() => consolidateBuild(structure), [structure]);
  const [focus, setFocus] = useState<Focus | null>(null);

  // The focused item's own chain, indexed by depth RELATIVE to the focus (0 =
  // the focused item, 1 = its direct inputs, 2 = theirs, …). Walking
  // `childrenOf` from the focus keeps each tier to the types actually consumed
  // at that step of THIS item's subtree — unlike a flat descendant set, which
  // would also match a type that sits at this depth elsewhere in the build
  // (e.g. a mineral a sibling capital part consumes directly).
  const chainLevels = useMemo(() => {
    if (!focus) return null;
    const levels = new Map<number, Set<number>>();
    levels.set(0, new Set([focus.typeId]));
    for (let k = 1; ; k += 1) {
      const next = new Set<number>();
      for (const parentId of levels.get(k - 1)!) {
        for (const child of childrenOf.get(parentId) ?? []) next.add(child);
      }
      if (next.size === 0) break;
      levels.set(k, next);
    }
    return levels;
  }, [focus, childrenOf]);

  // The layout never changes with focus: every tier is always in the grid.
  const visibleTiers = tiers;

  return (
    <>
      {focus && (
        <div className="mb-2.5 flex items-center gap-2 text-[10px]">
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="inline-flex items-center min-h-[40px] tracking-[0.12em] uppercase text-muted hover:text-name cursor-pointer"
          >
            ✕ Clear
          </button>
          <span className="text-muted">
            Tracing <span className="text-name">{focus.name}</span>
          </span>
        </div>
      )}
      <div
        className={cn(
          'grid grid-cols-1 gap-[22px] pb-3.5 xl:items-start xl:justify-center',
          TIER_GRID_COLS[Math.min(visibleTiers.length, 4)],
        )}
      >
        {visibleTiers.map((tier) => {
          // Which of this tier's types belong to the focused chain at this exact
          // step (relative depth), so only those light up and the rest dim.
          const inChain = focus && chainLevels ? chainLevels.get(tier.depth - focus.depth) : null;
          return (
          <div key={tier.depth} className="min-w-0">
            <div className="cascade-col-label">Tier {tier.depth}</div>
            <Card>
              {tier.items.map((item) => {
                const isSelected = !!focus && focus.typeId === item.typeId && focus.depth === tier.depth;
                const isRelated = !isSelected && (inChain?.has(item.typeId) ?? false);
                const isFaded = !!focus && !isSelected && !isRelated;
                return (
                  <TierItem
                    key={item.typeId}
                    item={item}
                    selected={isSelected}
                    related={isRelated}
                    faded={isFaded}
                    onSelect={
                      item.hasChildren
                        ? () =>
                            setFocus((prev) =>
                              prev && prev.typeId === item.typeId && prev.depth === tier.depth
                                ? null
                                : { depth: tier.depth, typeId: item.typeId, name: item.name },
                            )
                        : undefined
                    }
                  />
                );
              })}
            </Card>
          </div>
          );
        })}
      </div>
    </>
  );
}

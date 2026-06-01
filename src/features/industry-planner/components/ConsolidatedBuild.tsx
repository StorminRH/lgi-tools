'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format';
import { consolidateBuild, type ConsolidatedItem } from '../build-consolidate';
import type { BlueprintStructure } from '../types';

// The consolidated build view: a column per tier (build step below the
// product), each listing every input consumed at that depth — buildables and
// raws alike — with quantities summed across that tier. Clicking a buildable
// item lights up its downstream requirements across the lower tiers and dims
// everything else, so you can trace a single component's chain while still
// seeing the whole build when nothing is selected.

const ROW =
  'grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-[7px] border-t border-border-soft first:border-t-0 text-[12px] transition-opacity';

// On a marginal basis a deep input's share of one end product can be sub-unit.
function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return formatQuantity(quantity);
}

function tierLabel(depth: number): string {
  return `Tier ${depth}`;
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

export function ConsolidatedBuild({ structure }: { structure: BlueprintStructure }) {
  const { tiers, descendants } = useMemo(() => consolidateBuild(structure), [structure]);
  const [selected, setSelected] = useState<number | null>(null);

  // When a component is selected, the lit set is itself plus everything
  // downstream of it; everything else dims.
  const lit = useMemo(() => {
    if (selected === null) return null;
    const set = new Set<number>([selected]);
    for (const d of descendants.get(selected) ?? []) set.add(d);
    return set;
  }, [selected, descendants]);

  return (
    <div className="cascade">
      {tiers.map((tier) => (
        <div key={tier.depth} className="cascade-col w-[360px]">
          <div className="cascade-col-label">{tierLabel(tier.depth)}</div>
          <Card>
            {tier.items.map((item) => {
              const isSelected = item.typeId === selected;
              const isRelated = !isSelected && (lit?.has(item.typeId) ?? false);
              const isFaded = lit !== null && !lit.has(item.typeId);
              return (
                <TierItem
                  key={item.typeId}
                  item={item}
                  selected={isSelected}
                  related={isRelated}
                  faded={isFaded}
                  onSelect={
                    item.hasChildren
                      ? () => setSelected((prev) => (prev === item.typeId ? null : item.typeId))
                      : undefined
                  }
                />
              );
            })}
          </Card>
        </div>
      ))}
    </div>
  );
}

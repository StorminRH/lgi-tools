'use client';

import { useMemo, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format';
import { consolidateBuild, type ConsolidatedItem } from '../build-consolidate';
import type { BlueprintStructure } from '../types';

// The consolidated build view: a column per tier (build step below the
// product), each listing every input consumed at that depth — buildables and
// raws alike — with quantities summed across that tier. It opens to the first
// three tiers; clicking a buildable focuses on that tier and the one beneath
// it (its inputs), sliding the pair to the centre and hiding the rest, so you
// can walk a single component's chain one step at a time. The clicked item's
// downstream chain stays lit while everything else dims. Clicking the focused
// item again, or "All tiers", returns to the opening view.

const DEFAULT_TIERS = 3;

const ROW =
  'grid grid-cols-[32px_minmax(0,1fr)_auto_12px] items-center gap-2.5 px-3.5 py-[7px] border-t border-border-soft first:border-t-0 text-[12px] transition-opacity';

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
  const { tiers, descendants } = useMemo(() => consolidateBuild(structure), [structure]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [parent] = useAutoAnimate<HTMLDivElement>();

  // Opening view: the first few tiers. Focused: the chosen tier and the one
  // beneath it (its inputs), centred.
  const visibleTiers = focus
    ? tiers.filter((t) => t.depth === focus.depth || t.depth === focus.depth + 1)
    : tiers.slice(0, DEFAULT_TIERS);

  // The lit set when focused: the chosen item plus everything downstream of it.
  const lit = useMemo(() => {
    if (!focus) return null;
    const set = new Set<number>([focus.typeId]);
    for (const d of descendants.get(focus.typeId) ?? []) set.add(d);
    return set;
  }, [focus, descendants]);

  return (
    <>
      {focus && (
        <div className="mb-2.5 flex items-center gap-2 text-[10px]">
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="tracking-[0.12em] uppercase text-muted hover:text-name cursor-pointer"
          >
            ← All tiers
          </button>
          <span className="text-muted">
            Tracing <span className="text-name">{focus.name}</span>
          </span>
        </div>
      )}
      <div ref={parent} className="cascade justify-center">
        {visibleTiers.map((tier) => (
          <div key={tier.depth} className="cascade-col w-[360px]">
            <div className="cascade-col-label">Tier {tier.depth}</div>
            <Card>
              {tier.items.map((item) => {
                const isSelected = !!focus && focus.typeId === item.typeId && focus.depth === tier.depth;
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
        ))}
      </div>
    </>
  );
}

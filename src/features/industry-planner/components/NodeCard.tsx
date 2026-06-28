'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Popover, PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { QtyRing } from '@/components/ui/qty-ring';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatQuantity } from '@/lib/format/number';
import { ProvenanceRows } from './MeAdjuster';
import type { OwnedComponentDetail } from '../types';

// The build-plan node card (3.7.5.7 re-layout). One component, used by the live
// build plan (`CockpitBuildPlan`) and the sandbox. Layout: the type icon + name/type
// on top, the inline ME/TE efficiency fields beneath (passed in as `efficiency` — a
// manufacturable buildable only; raws/reactions get none); the ISK value top-right
// and a QTY progress ring beneath it. The ring is the future asset-acquisition track:
// it renders empty now with the needed quantity in the centre, and its hover shows
// owner / location / needed. Clicking the card drills the cascade (when `onSelect` is
// set); the fields + ring hover stop their own events so editing/hovering doesn't drill.

const CARD =
  'flex gap-2.5 border-t border-border-soft first:border-t-0 px-3 py-2.5 text-left transition-opacity';

// Compact needed-quantity for the ring centre (sub-unit marginal shares → "<1").
function ringQty(qty: number): string {
  if (qty > 0 && qty < 0.5) return '<1';
  return formatCompactQuantity(qty);
}

// The QTY ring + its hover (needed; plus owner/location for an owned buildable).
function QtyRingCell({
  name,
  qty,
  detail,
}: {
  name: string;
  qty: number;
  detail: OwnedComponentDetail | undefined;
}) {
  return (
    // Stop the trigger's click/keys reaching the card so the hover never drills down.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Popover
        label={`${name} — quantity`}
        side="left"
        triggerClassName="cursor-help"
        trigger={
          <QtyRing progress={0} className="h-10 w-10" label={`${name}: ${formatQuantity(qty)} needed`}>
            <span className="font-mono text-[10px] tabular-nums text-name">{ringQty(qty)}</span>
          </QtyRing>
        }
      >
        <PopoverHeading>{name}</PopoverHeading>
        <PopoverRow label="Needed">{formatQuantity(qty)}</PopoverRow>
        {detail && <ProvenanceRows detail={detail} />}
      </Popover>
    </span>
  );
}

export function NodeCard({
  typeId,
  name,
  label,
  qty,
  value,
  efficiency,
  detail,
  selected,
  related,
  faded,
  onSelect,
}: {
  typeId: number;
  name: string;
  label: string;
  qty: number;
  value: number | null;
  // The inline ME/TE fields, when this node is a manufacturable buildable.
  efficiency?: ReactNode;
  // The owned blueprint's owner/location, for the ring hover (owned buildables only).
  detail?: OwnedComponentDetail;
  selected: boolean;
  related: boolean;
  faded: boolean;
  // Drill into this node's sub-tree; undefined when it has no children.
  onSelect?: () => void;
}) {
  const interactive = !!onSelect;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={onSelect}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
      className={cn(
        CARD,
        faded && 'opacity-25',
        related && 'bg-row-related',
        selected && 'bg-isk-selected shadow-[inset_2px_0_0_var(--color-isk)]',
        interactive && 'cursor-pointer hover:bg-row-hover',
      )}
    >
      {/* Left: icon + name/type on top, the ME/TE fields beneath. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 gap-2.5">
          <TypeIcon typeId={typeId} size={30} mono={name.slice(0, 2)} />
          <div className="flex min-w-0 flex-col gap-px">
            <span className="line-clamp-2 break-words font-mono text-[12.5px] font-medium leading-[1.28] text-name">
              {name}
            </span>
            <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
              {label}
            </span>
          </div>
        </div>
        {efficiency && <div className="flex items-center gap-2">{efficiency}</div>}
      </div>
      {/* Right: ISK value on top, the QTY ring beneath. */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-1.5">
        <span className="whitespace-nowrap font-mono text-[11.5px] tabular-nums text-text">
          {value !== null ? formatIsk(value) : '—'}
        </span>
        <QtyRingCell name={name} qty={qty} detail={detail} />
      </div>
    </div>
  );
}

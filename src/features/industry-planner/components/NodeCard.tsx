'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import { QtyRing } from '@/components/ui/qty-ring';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatQuantity } from '@/lib/format/number';
import { ProvenanceRows } from './MeAdjuster';
import type { NodeMeState } from '../me-overrides';
import type { OwnedComponentDetail } from '../types';

// The build-plan node card (3.7.5.8 re-layout). Every node is the SAME shape — a
// fixed-size framed icon, the name/type, then a QTY ring — all on one centreline, so a
// card's height never depends on what controls it carries (the inline ME/TE row that
// used to vary the height is gone). For a manufacturable buildable the icon sits in a
// box frame tinted by ownership (hollow unowned / blue owned / orange a manual
// what-if) and CLICKING it opens the Blueprint Research Adjusters popover (the ME/TE
// adjusters plus, for an owned blueprint, its owner/location); raws and reactions get a
// plain icon in the SAME 40px footprint (a transparent frame) so every icon and ring
// still lines up across nodes. Clicking the QTY ring opens the Asset Tracking ledger
// (needed / owned / remaining). Clicking the card body drills the cascade (when
// `onSelect` is set); the icon + ring stop their own events so opening them never drills.

// The popover adjusters for a buildable node, plus the single tone that colours its
// icon frame. Absent for raws/reactions (a plain, frameless icon).
export interface NodeEfficiency {
  state: NodeMeState;
  adjusters: ReactNode;
}

// A `min-h` floor keeps every card the same height whatever its name length (1 vs 2
// lines) — the uniformity the layout is for; the icon + ring centre on the same line.
const CARD =
  'flex min-h-[72px] items-center gap-2.5 border-t border-border-soft first:border-t-0 px-3 py-2.5 text-left transition-opacity';

// The icon frame: a fixed 40px box (mirrors the QTY ring) holding the 30px icon. The
// 2.5px border matches the ring's stroke; its tone is the node's combined ME/TE state.
// A transparent frame keeps raws/reactions on the identical footprint so icons align.
const FRAME = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border-[2.5px]';
const FRAME_TONE: Record<NodeMeState, string> = {
  unowned: 'border-border-soft',
  owned: 'border-evb-bright',
  manual: 'border-[var(--color-dps-mid)]',
};

// Compact needed-quantity for the ring centre (sub-unit marginal shares → "<1").
function ringQty(qty: number): string {
  if (qty > 0 && qty < 0.5) return '<1';
  return formatCompactQuantity(qty);
}

// The needed / owned / remaining totals as an aligned three-column ledger (label · qty ·
// ISK) so they stack like a subtraction. Needed is real; owned + remaining are "—"
// placeholders until item-asset sync exists (then they compute against held holdings).
function AssetLedger({ qty, value }: { qty: number; value: number | null }) {
  const isk = value !== null ? formatIsk(value) : '—';
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 border-t border-border-soft pt-2 font-mono text-[11px] tabular-nums">
      <span className="text-muted">Total Needed</span>
      <span className="text-right text-name">{formatQuantity(qty)}</span>
      <span className="text-right text-isk">{isk}</span>
      <span className="text-muted">Total Owned</span>
      <span className="text-right text-faint">—</span>
      <span className="text-right text-faint">—</span>
      <span className="text-muted">Total Remaining</span>
      <span className="text-right text-faint">—</span>
      <span className="text-right text-faint">—</span>
    </div>
  );
}

// The QTY ring + its click popover — the asset-tracking ledger: who holds the item, then
// the needed / owned / remaining totals. Owned-asset data isn't synced yet, so the
// held-by section and the owned/remaining rows are placeholders; only "Total Needed" is
// real today. When item-asset sync lands, the held-by fills with one group per owner
// (corporation / character) → per location → quantity (a per-owner subtotal when
// multi-location), and owned/remaining compute against it — the same ledger alignment,
// so the layout is unchanged.
function QtyRingCell({
  name,
  qty,
  value,
}: {
  name: string;
  qty: number;
  value: number | null;
}) {
  return (
    // Stop the trigger's click/keys reaching the card so opening it never drills down.
    <span className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Popover
        label={`${name} — asset tracking`}
        side="left"
        openOnHover={false}
        triggerClassName="flex items-center cursor-pointer"
        trigger={
          <QtyRing progress={0} className="h-10 w-10" label={`${name}: ${formatQuantity(qty)} needed`}>
            <span className="font-mono text-[10px] tabular-nums text-name">{ringQty(qty)}</span>
          </QtyRing>
        }
      >
        <PopoverHeading>Asset Tracking</PopoverHeading>
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Item held by</div>
          <div className="font-mono text-[10.5px] text-faint">No holdings tracked yet</div>
        </div>
        <AssetLedger qty={qty} value={value} />
      </Popover>
    </span>
  );
}

// A buildable's framed icon: the frame IS the popover trigger, tinted by state, and
// click-opens the ME/TE adjusters. The wrapping span stops the click/keys reaching the
// card so opening the popover never drills the cascade.
function BuildableIcon({
  typeId,
  name,
  efficiency,
  detail,
}: {
  typeId: number;
  name: string;
  efficiency: NodeEfficiency;
  // The owned blueprint's owner/location, shown under the adjusters (owned only).
  detail: OwnedComponentDetail | undefined;
}) {
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Popover
        label={`${name} — efficiency`}
        side="bottom"
        openOnHover={false}
        triggerClassName={cn(FRAME, FRAME_TONE[efficiency.state], 'cursor-pointer')}
        trigger={<TypeIcon typeId={typeId} size={30} mono={name.slice(0, 2)} />}
      >
        <PopoverHeading>Blueprint Research Adjusters</PopoverHeading>
        {efficiency.adjusters}
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
  // Present for a manufacturable buildable → a framed, click-popover icon. Absent for
  // raws/reactions → a plain icon in the same footprint.
  efficiency?: NodeEfficiency;
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
      {/* The framed icon — a tinted click-popover for buildables, a plain (transparent
          frame) icon on the same footprint for raws/reactions. */}
      {efficiency ? (
        <BuildableIcon typeId={typeId} name={name} efficiency={efficiency} detail={detail} />
      ) : (
        <span className={cn(FRAME, 'border-transparent')}>
          <TypeIcon typeId={typeId} size={30} mono={name.slice(0, 2)} />
        </span>
      )}
      {/* Name + type. */}
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="line-clamp-2 break-words font-mono text-[12.5px] font-medium leading-[1.28] text-name">
          {name}
        </span>
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
          {label}
        </span>
      </div>
      {/* Quantity ring — its popover is the asset-tracking ledger (needed/owned/remaining). */}
      <QtyRingCell name={name} qty={qty} value={value} />
    </div>
  );
}

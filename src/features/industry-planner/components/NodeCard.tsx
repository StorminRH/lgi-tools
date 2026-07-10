'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import { QtyRing } from '@/components/ui/qty-ring';
import { TypeIcon, type TypeIconVariant } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatQuantity } from '@/lib/format/number';
import { ProvenanceRows } from './MeAdjuster';
import type { NodeMeState } from '../me-overrides';
import { ownedLedgerRow } from '../node-card-ledger';
import type { AssetHolding, OwnedComponentDetail } from '../types';

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
// ISK) so they stack like a subtraction. Needed is always real; owned + remaining fill
// from the caller's synced assets (3.7.7.2) when `ownedQty` is present, and stay "—"
// placeholders when it is absent (a logged-out caller or one owning none of this type).
function AssetLedger({ qty, value, ownedQty }: { qty: number; value: number | null; ownedQty?: number }) {
  const isk = value !== null ? formatIsk(value) : '—';
  const row = ownedQty !== undefined ? ownedLedgerRow(qty, ownedQty, value) : null;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 border-t border-border-soft pt-2 font-mono text-[11px] tabular-nums">
      <span className="text-muted">Total Needed</span>
      <span className="text-right text-name">{formatQuantity(qty)}</span>
      <span className="text-right text-isk">{isk}</span>
      <span className="text-muted">Total Owned</span>
      {row ? (
        <>
          <span className="text-right text-name">{row.owned.qty}</span>
          <span className="text-right text-isk">{row.owned.isk}</span>
        </>
      ) : (
        <>
          <span className="text-right text-faint">—</span>
          <span className="text-right text-faint">—</span>
        </>
      )}
      <span className="text-muted">Total Remaining</span>
      {row ? (
        <>
          <span className="text-right text-name">{row.remaining.qty}</span>
          <span className="text-right text-isk">{row.remaining.isk}</span>
        </>
      ) : (
        <>
          <span className="text-right text-faint">—</span>
          <span className="text-right text-faint">—</span>
        </>
      )}
    </div>
  );
}

// One "held by" row: who holds the units, where, and how much. Plain presentational
// markup inside the existing ring popover — owner on top, location · flag beneath,
// quantity right-aligned. Mirrors the MeAdjuster ProvenanceRows idiom.
function HoldingLine({ holding }: { holding: AssetHolding }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-[10.5px]">
      <span className="min-w-0">
        <span className="text-name">{holding.ownerName}</span>
        <span className="block text-[9px] tracking-[0.04em] text-muted">
          {holding.locationName}
          {holding.locationFlag ? ` · ${holding.locationFlag}` : ''}
        </span>
      </span>
      <span className="shrink-0 tabular-nums text-faint">{formatQuantity(holding.quantity)}</span>
    </div>
  );
}

// A green completion check for a fully-owned node — replaces the ring's count, paired
// with the full green arc, when nothing more is needed.
function RingCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] stroke-isk"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

// The QTY ring + its click popover — the asset-tracking ledger: who holds the item, then
// the needed / owned / remaining totals. The ring fills green as the caller's synced
// assets accumulate (progress = owned ÷ needed) and its centre shows how many MORE are
// needed (the still-to-acquire count, shrinking as stock arrives); at full ownership the
// arc closes and a green check replaces the count. With no synced data (logged-out /
// owning none) the ring is the empty placeholder and the held-by + owned/remaining rows
// show "—".
function QtyRingCell({
  name,
  qty,
  value,
  ownedQty,
  heldBy,
}: {
  name: string;
  qty: number;
  value: number | null;
  // On-hand units for this type; absent → the empty-ring + "—" placeholders (today's output).
  ownedQty?: number;
  // Where the units sit; absent/empty → "No holdings tracked yet".
  heldBy?: AssetHolding[];
}) {
  // progress 0 (and the default neutral tone) until we have the owned count → the empty-track
  // placeholder, byte-identical to today; the green arc fills owned ÷ needed once synced.
  const progress = ownedQty !== undefined && qty > 0 ? Math.min(ownedQty / qty, 1) : 0;
  // The still-to-acquire count in the ring centre — the whole need when nothing is owned
  // (so the placeholder is unchanged), shrinking toward 0 as stock accumulates.
  const remaining = Math.max(0, qty - (ownedQty ?? 0));
  // Fully owned: synced data present (ownedQty set), a real need (qty > 0 — so a degenerate
  // zero-need node never shows a check over an empty ring), and nothing left to acquire.
  const complete = ownedQty !== undefined && qty > 0 && remaining === 0;
  const ringLabel =
    ownedQty === undefined
      ? `${name}: ${formatQuantity(qty)} needed`
      : complete
        ? `${name}: all ${formatQuantity(qty)} owned`
        : `${name}: ${formatQuantity(remaining)} still needed`;
  return (
    // Stop the trigger's click/keys reaching the card so opening it never drills down.
    <span className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Popover
        label={`${name} — asset tracking`}
        side="left"
        openOnHover={false}
        triggerClassName="flex items-center cursor-pointer"
        trigger={
          <QtyRing progress={progress} tone={progress > 0 ? 'isk' : 'neutral'} className="h-10 w-10" label={ringLabel}>
            {complete ? (
              <RingCheck />
            ) : (
              <span className="font-mono text-[10px] tabular-nums text-name">{ringQty(remaining)}</span>
            )}
          </QtyRing>
        }
      >
        <PopoverHeading>Asset Tracking</PopoverHeading>
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Item held by</div>
          {heldBy && heldBy.length > 0 ? (
            heldBy.map((holding, i) => (
              <HoldingLine
                key={`${holding.ownerName}-${holding.locationName}-${holding.locationFlag}-${i}`}
                holding={holding}
              />
            ))
          ) : (
            <div className="font-mono text-[10.5px] text-faint">No holdings tracked yet</div>
          )}
        </div>
        <AssetLedger qty={qty} value={value} ownedQty={ownedQty} />
      </Popover>
    </span>
  );
}

// A buildable's framed icon: the frame IS the popover trigger, tinted by state, and
// click-opens the ME/TE adjusters. The wrapping span stops the click/keys reaching the
// card so opening the popover never drills the cascade.
function BuildableIcon({
  icon,
  name,
  efficiency,
  detail,
}: {
  // The rendition to show — the producing blueprint's `bp` icon for a buildable.
  icon: { typeId: number; variant: TypeIconVariant };
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
        trigger={<TypeIcon typeId={icon.typeId} variant={icon.variant} size={30} mono={name.slice(0, 2)} />}
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
  icon,
  name,
  label,
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
  typeId: number;
  // The rendition the icon should show. Absent → the item's own `icon` (today's
  // default). A buildable/reaction node passes its producing blueprint/formula
  // in the `bp` rendition — the icon of what you run. TypeIcon stays
  // domain-agnostic; this component just forwards the chosen variant.
  icon?: { typeId: number; variant: TypeIconVariant };
  name: string;
  label: string;
  qty: number;
  value: number | null;
  // Present for a manufacturable buildable → a framed, click-popover icon. Absent for
  // raws/reactions → a plain icon in the same footprint.
  efficiency?: NodeEfficiency;
  // The owned blueprint's owner/location, shown in the icon popover (owned buildables only).
  detail?: OwnedComponentDetail;
  // The caller's on-hand units of this type + where they sit (3.7.7.2). Absent → the
  // QTY ring + ledger render their owns-none placeholders.
  ownedQty?: number;
  heldBy?: AssetHolding[];
  selected: boolean;
  related: boolean;
  faded: boolean;
  // Drill into this node's sub-tree; undefined when it has no children.
  onSelect?: () => void;
}) {
  const interactive = !!onSelect;
  // Default to the item's own icon so callers that don't set `icon` (and every
  // non-planner consumer) stay byte-identical to today.
  const iconDesc = icon ?? { typeId, variant: 'icon' as const };
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
        <BuildableIcon icon={iconDesc} name={name} efficiency={efficiency} detail={detail} />
      ) : (
        <span className={cn(FRAME, 'border-transparent')}>
          <TypeIcon typeId={iconDesc.typeId} variant={iconDesc.variant} size={30} mono={name.slice(0, 2)} />
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
      <QtyRingCell name={name} qty={qty} value={value} ownedQty={ownedQty} heldBy={heldBy} />
    </div>
  );
}

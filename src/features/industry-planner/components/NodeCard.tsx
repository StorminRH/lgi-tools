'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import { QtyRing } from '@/components/ui/qty-ring';
import { TypeIcon, type TypeIconVariant } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format/number';
import { ProvenanceRows } from './MeAdjuster';
import type { NodeMeState } from '../me-overrides';
import { assetLedgerView, qtyRingView, ringQty, type LedgerCell } from '../node-card-ledger';
import { nodeCardView } from '../node-card-view';
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

// The icon frame: a fixed 40px box (mirrors the QTY ring) holding the 30px icon. The
// 2.5px border matches the ring's stroke; its tone is the node's combined ME/TE state.
// A transparent frame keeps raws/reactions on the identical footprint so icons align.
const FRAME = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border-[2.5px]';
const FRAME_TONE: Record<NodeMeState, string> = {
  unowned: 'border-border-soft',
  owned: 'border-evb-bright',
  manual: 'border-[var(--color-dps-mid)]',
};

// One owned/remaining ledger cell pair — the real qty·ISK when synced, else the
// "—" placeholders (logged-out / owns-none).
function LedgerCells({ cell }: { cell: LedgerCell | null }) {
  if (cell) {
    return (
      <>
        <span className="text-right text-name">{cell.qty}</span>
        <span className="text-right text-isk">{cell.isk}</span>
      </>
    );
  }
  return (
    <>
      <span className="text-right text-faint">—</span>
      <span className="text-right text-faint">—</span>
    </>
  );
}

// The needed / owned / remaining totals as an aligned three-column ledger (label · qty ·
// ISK) so they stack like a subtraction. Needed is always real; owned + remaining fill
// from the caller's synced assets (3.7.7.2) when `ownedQty` is present, and stay "—"
// placeholders when it is absent (a logged-out caller or one owning none of this type).
function AssetLedger({ qty, value, ownedQty }: { qty: number; value: number | null; ownedQty?: number }) {
  const view = assetLedgerView(qty, value, ownedQty);
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 border-t border-border-soft pt-2 font-mono text-[11px] tabular-nums">
      <span className="text-muted">Total Needed</span>
      <span className="text-right text-name">{view.neededQty}</span>
      <span className="text-right text-isk">{view.neededIsk}</span>
      <span className="text-muted">Total Owned</span>
      <LedgerCells cell={view.owned} />
      <span className="text-muted">Total Remaining</span>
      <LedgerCells cell={view.remaining} />
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
// The "held by" list or the empty placeholder — who holds this type's units.
function HeldByList({ heldBy }: { heldBy?: AssetHolding[] }) {
  if (heldBy && heldBy.length > 0) {
    return (
      <>
        {heldBy.map((holding, i) => (
          <HoldingLine
            key={`${holding.ownerName}-${holding.locationName}-${holding.locationFlag}-${i}`}
            holding={holding}
          />
        ))}
      </>
    );
  }
  return <div className="font-mono text-[10.5px] text-faint">No holdings tracked yet</div>;
}

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
  const view = qtyRingView(name, qty, ownedQty);
  return (
    // Stop the trigger's click/keys reaching the card so opening it never drills down.
    <span className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Popover
        label={`${name} — asset tracking`}
        side="left"
        openOnHover={false}
        triggerClassName="flex items-center cursor-pointer"
        trigger={
          <QtyRing progress={view.progress} tone={view.tone} className="h-10 w-10" label={view.ringLabel}>
            {view.complete ? (
              <RingCheck />
            ) : (
              <span className="font-mono text-[10px] tabular-nums text-name">{ringQty(view.remaining)}</span>
            )}
          </QtyRing>
        }
      >
        <PopoverHeading>Asset Tracking</PopoverHeading>
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Item held by</div>
          <HeldByList heldBy={heldBy} />
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
  const view = nodeCardView({ onSelect, icon, typeId, selected, related, faded });
  return (
    <div
      role={view.role}
      tabIndex={view.tabIndex}
      aria-pressed={view.ariaPressed}
      onClick={onSelect}
      onKeyDown={
        view.interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
      className={view.className}
    >
      {/* The framed icon — a tinted click-popover for buildables, a plain (transparent
          frame) icon on the same footprint for raws/reactions. */}
      {efficiency ? (
        <BuildableIcon icon={view.iconDesc} name={name} efficiency={efficiency} detail={detail} />
      ) : (
        <span className={cn(FRAME, 'border-transparent')}>
          <TypeIcon typeId={view.iconDesc.typeId} variant={view.iconDesc.variant} size={30} mono={name.slice(0, 2)} />
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

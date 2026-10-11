'use client';

import { useRef, type FocusEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { CheckIcon } from '@/components/ui/icons';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import { QtyRing } from '@/components/ui/qty-ring';
import { TypeIcon } from '@/components/type-icon';
import type { EveImageDescriptor } from '@/data/eve-data/type-images';
import { formatQuantity } from '@/lib/format/number';
import { ProvenanceRows } from './MeAdjuster';
import { EFFICIENCY_TONE_CLASSES } from '../industry-styles';
import type { NodeMeState } from '../me-overrides';
import { assetLedgerView, qtyRingView, ringQty, type LedgerCell } from '../node-card-ledger';
import { nodeCardView } from '../node-card-view';
import type { AssetHolding, OwnedComponentDetail } from '../types';

export interface NodeEfficiency {
  state: NodeMeState;
  adjusters: ReactNode;
}

const FRAME = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-card border-[2.5px]';

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

function AssetLedger({ qty, value, ownedQty }: { qty: number; value: number | null; ownedQty?: number }) {
  const view = assetLedgerView(qty, value, ownedQty);
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 border-t border-border-soft pt-2 text-ui tabular-nums">
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

function HoldingLine({ holding }: { holding: AssetHolding }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-ui">
      <span className="min-w-0">
        <span className="text-name">{holding.ownerName}</span>
        <span className="block text-ui leading-snug text-muted">
          {holding.locationName}
          {holding.locationFlag ? ` · ${holding.locationFlag}` : ''}
          {holding.containerName ? ` › ${holding.containerName}` : ''}
        </span>
      </span>
      <span className="shrink-0 tabular-nums text-faint">{formatQuantity(holding.quantity)}</span>
    </div>
  );
}

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
  return <EmptyState>No holdings tracked yet</EmptyState>;
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
  ownedQty?: number;
  heldBy?: AssetHolding[];
}) {
  const view = qtyRingView(name, qty, ownedQty);
  return (
    <span className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Popover
        label={`${name} — asset tracking`}
        side="left"
        openOnHover={false}
        triggerClassName="flex items-center cursor-pointer"
        trigger={
          <QtyRing progress={view.progress} tone={view.tone} className="h-10 w-10" label={view.ringLabel}>
            {view.complete ? (
              <CheckIcon strokeWidth={3} className="size-icon-md text-isk" />
            ) : (
              <span className="font-data text-ui tabular-nums text-name">{ringQty(view.remaining)}</span>
            )}
          </QtyRing>
        }
      >
        <PopoverHeading>Asset Tracking</PopoverHeading>
        <div className="flex flex-col gap-1">
          <div className="text-label uppercase tracking-wide text-muted">Item held by</div>
          <HeldByList heldBy={heldBy} />
        </div>
        <AssetLedger qty={qty} value={value} ownedQty={ownedQty} />
      </Popover>
    </span>
  );
}

function BuildableIcon({
  icon,
  name,
  efficiency,
  detail,
}: {
  icon: EveImageDescriptor;
  name: string;
  efficiency: NodeEfficiency;
  detail: OwnedComponentDetail | undefined;
}) {
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Popover
        label={`${name} — efficiency`}
        side="bottom"
        openOnHover={false}
        triggerClassName={cn(
          FRAME,
          EFFICIENCY_TONE_CLASSES[efficiency.state].frame,
          'cursor-pointer',
        )}
        trigger={<TypeIcon {...icon} size={30} mono={name} />}
      >
        <PopoverHeading>Blueprint Research Adjusters</PopoverHeading>
        {efficiency.adjusters}
        {detail && <ProvenanceRows detail={detail} />}
      </Popover>
    </span>
  );
}

/** A buildable's icon opens its research adjusters; anything else just shows. */
function NodeIcon({
  icon,
  name,
  efficiency,
  detail,
}: {
  icon: EveImageDescriptor;
  name: string;
  efficiency: NodeEfficiency | undefined;
  detail: OwnedComponentDetail | undefined;
}) {
  if (efficiency) return <BuildableIcon icon={icon} name={name} efficiency={efficiency} detail={detail} />;
  return (
    <span className={cn(FRAME, 'border-transparent')}>
      <TypeIcon {...icon} size={30} mono={name} />
    </span>
  );
}

/** Keep the chain lit while the pointer or focus is anywhere in the card. */
function useHoverProps(onHover: ((entering: boolean) => void) | undefined) {
  const inside = useRef({ pointer: false, focus: false });
  if (!onHover) return {};
  return {
    onPointerEnter: () => {
      inside.current.pointer = true;
      onHover(true);
    },
    onPointerLeave: () => {
      inside.current.pointer = false;
      onHover(inside.current.focus);
    },
    onFocus: () => {
      inside.current.focus = true;
      onHover(true);
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      inside.current.focus = false;
      onHover(inside.current.pointer);
    },
  };
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
  lit,
  dimmed,
  onOpen,
  onHover,
}: {
  typeId: number;
  icon?: EveImageDescriptor;
  name: string;
  label: string;
  qty: number;
  value: number | null;
  efficiency?: NodeEfficiency;
  detail?: OwnedComponentDetail;
  ownedQty?: number;
  heldBy?: AssetHolding[];
  lit: boolean;
  dimmed: boolean;
  /** Opens the item's job; only buildables have one. */
  onOpen?: () => void;
  /** Pointer or focus entering (true) and leaving (false) a buildable. */
  onHover?: (entering: boolean) => void;
}) {
  const view = nodeCardView({ onOpen, icon, typeId, lit, dimmed });
  const hover = useHoverProps(view.interactive ? onHover : undefined);
  return (
    <div className={view.className} {...hover}>
      {view.interactive && (
        <Button
          variant="bare"
          type="button"
          aria-label={`Open ${name}`}
          onClick={onOpen}
          className="absolute inset-0 z-0"
        />
      )}
      <span className="relative z-10 pointer-events-none [grid-area:icon] [&_button]:pointer-events-auto">
        <NodeIcon icon={view.iconDesc} name={name} efficiency={efficiency} detail={detail} />
      </span>
      <div className="relative z-10 pointer-events-none flex min-w-0 flex-col gap-px [grid-area:name]">
        <span className="line-clamp-2 break-words font-data text-ui font-medium leading-[1.28] text-name">
          {name}
        </span>
        <span className="truncate font-data text-label uppercase tracking-label text-muted">
          {label}
        </span>
      </div>
      <span className="relative z-10 pointer-events-none [grid-area:qty] [&_button]:pointer-events-auto">
        <QtyRingCell name={name} qty={qty} value={value} ownedQty={ownedQty} heldBy={heldBy} />
      </span>
    </div>
  );
}

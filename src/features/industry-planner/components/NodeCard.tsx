'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
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
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 border-t border-border-soft pt-2 font-data text-ui tabular-nums">
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
    <div className="flex items-baseline justify-between gap-3 font-data text-ui">
      <span className="min-w-0">
        <span className="text-name">{holding.ownerName}</span>

        <span className="block text-micro tracking-copy text-muted">
          {holding.locationName}
          {holding.locationFlag ? ` · ${holding.locationFlag}` : ''}
        </span>

      </span>

      <span className="shrink-0 tabular-nums text-faint">{formatQuantity(holding.quantity)}</span>

    </div>

  );
}

function RingCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-icon-md stroke-isk"
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
              <RingCheck />
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
        trigger={<TypeIcon {...icon} size={30} mono={name.slice(0, 2)} />}
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

  icon?: EveImageDescriptor;
  name: string;
  label: string;
  qty: number;
  value: number | null;

  efficiency?: NodeEfficiency;

  detail?: OwnedComponentDetail;

  ownedQty?: number;
  heldBy?: AssetHolding[];
  selected: boolean;
  related: boolean;
  faded: boolean;

  onSelect?: () => void;
}) {
  const view = nodeCardView({ onSelect, icon, typeId, selected, related, faded });
  return (
    <div
      className={view.className}
    >
      {view.interactive && (
        <Button
          variant="bare"
          type="button"
          aria-label={`Trace ${name}`}
          aria-pressed={selected}
          onClick={onSelect}
          className="absolute inset-0 z-0"
        />
      )}
      <span className="relative z-10 pointer-events-none [&_button]:pointer-events-auto">
        {efficiency ? (
          <BuildableIcon icon={view.iconDesc} name={name} efficiency={efficiency} detail={detail} />
        ) : (
          <span className={cn(FRAME, 'border-transparent')}>
            <TypeIcon {...view.iconDesc} size={30} mono={name.slice(0, 2)} />
          </span>

        )}
      </span>

      <div className="relative z-10 pointer-events-none flex min-w-0 flex-1 flex-col gap-px">
        <span className="line-clamp-2 break-words font-data text-ui font-medium leading-[1.28] text-name">
          {name}
        </span>

        <span className="truncate font-data text-label uppercase tracking-label text-muted">
          {label}
        </span>

      </div>

      <span className="relative z-10 pointer-events-none [&_button]:pointer-events-auto">
        <QtyRingCell name={name} qty={qty} value={value} ownedQty={ownedQty} heldBy={heldBy} />
      </span>

    </div>

  );
}

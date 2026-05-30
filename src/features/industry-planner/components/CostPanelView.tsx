import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { HoverPopover } from '@/components/ui/hover-popover';
import { ResourceRow } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import { formatIsk, formatPct, formatQuantity } from '@/lib/format';
import { marginToneClass } from '../industry-styles';
import type {
  BlueprintPricing,
  BlueprintStructure,
  MaterialCostRow,
} from '../types';

// Presentational cost panel, shared by the streamed priced view and its
// Suspense fallback so the layout is identical the moment the shell paints and
// when prices stream in. `pricing === null` is the loading/fallback state: rows
// come from the (already-known) structure with "—" placeholders.

const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto_auto]';

// One line of the price-detail popover (the planner's HoverPopover consumer).
function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-[2px]">
      <span className="text-[10px] uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="text-[11px] text-isk tabular-nums">{value}</span>
    </div>
  );
}

// name | quantity (muted) | extended ISK cost. One row primitive for both the
// priced and the skeleton states. When `detail` is present (priced rows), the
// cost is a HoverPopover trigger showing the per-unit Jita price breakdown —
// the planner's use of the shared popover primitive.
function CostRow({
  name,
  quantity,
  extendedCost,
  detail,
}: {
  name: string;
  quantity: number;
  extendedCost: number | null;
  detail?: MaterialCostRow;
}) {
  const cost = formatIsk(extendedCost);
  const value =
    detail && detail.unitBuy !== null ? (
      <HoverPopover
        placement="bottom-end"
        label={`${name} Jita prices`}
        trigger={
          <span className="underline decoration-dotted decoration-border-soft underline-offset-2">
            {cost}
          </span>
        }
      >
        <div className="text-[9px] uppercase tracking-[0.14em] text-muted mb-1.5">
          {name} · per unit
        </div>
        <DetailLine label="Buy" value={formatIsk(detail.unitBuy)} />
        <DetailLine label="Sell" value={formatIsk(detail.bestSell)} />
        <DetailLine label="Buy 5%" value={formatIsk(detail.pct5Buy)} />
        <DetailLine label="Sell 5%" value={formatIsk(detail.pct5Sell)} />
      </HoverPopover>
    ) : (
      cost
    );

  return (
    <ResourceRow
      colsClass={ROW_COLS}
      name={name}
      meta={`× ${formatQuantity(quantity)}`}
      value={value}
    />
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="text-[13px] font-semibold text-isk whitespace-nowrap">{value}</div>
    </div>
  );
}

function Summary({ pricing }: { pricing: BlueprintPricing | null }) {
  if (!pricing) {
    return (
      <div className="px-[18px] py-[14px] border-b border-border">
        <div className="text-[9px] uppercase tracking-[0.16em] text-muted">Margin (before fees)</div>
        <div className="text-[20px] font-semibold text-muted">Calculating…</div>
      </div>
    );
  }
  const { margin, marginPct, inputCost, revenue, incomplete } = pricing.summary;
  return (
    <div className="px-[18px] py-[14px] border-b border-border flex flex-wrap gap-x-6 gap-y-3 justify-between items-end">
      <div>
        <div className="text-[9px] uppercase tracking-[0.16em] text-muted">Margin (before fees)</div>
        <div className={cn('text-[20px] font-semibold leading-[1.15]', marginToneClass(marginPct))}>
          {formatIsk(margin)}
          {marginPct !== null && (
            <span className="text-[12px] ml-2">({formatPct(marginPct)})</span>
          )}
        </div>
        {incomplete && (
          <div className="text-[9px] text-muted mt-1">
            Partial estimate — some prices unavailable.
          </div>
        )}
      </div>
      <div className="flex gap-5">
        <SummaryStat label="Input cost" value={formatIsk(inputCost)} />
        <SummaryStat label="Sell (Jita)" value={formatIsk(revenue)} />
      </div>
    </div>
  );
}

export function CostPanelView({
  pricing,
  structure,
  refreshing = false,
}: {
  pricing: BlueprintPricing | null;
  structure: BlueprintStructure;
  // True while the client is fetching fresh prices for stale/missing rows.
  refreshing?: boolean;
}) {
  const hasMaterials =
    pricing !== null ? pricing.rows.length > 0 : structure.flatMaterials.length > 0;

  return (
    <Card>
      <Summary pricing={pricing} />
      <SectionHeader label="Raw Materials" hint={refreshing ? 'Jita buy · updating…' : 'Jita buy'} />
      {hasMaterials ? (
        pricing !== null ? (
          pricing.rows.map((row) => (
            <CostRow
              key={row.typeId}
              name={row.name}
              quantity={row.quantity}
              extendedCost={row.extendedCost}
              detail={row}
            />
          ))
        ) : (
          structure.flatMaterials.map((m) => (
            <CostRow
              key={m.typeId}
              name={structure.materialNames[m.typeId] ?? `Type ${m.typeId}`}
              quantity={m.quantity}
              extendedCost={null}
            />
          ))
        )
      ) : (
        <div className="px-3.5 py-3 text-[11px] text-muted">No raw materials to price.</div>
      )}
      <SectionFooter
        label="Total input cost"
        value={pricing !== null ? formatIsk(pricing.summary.inputCost) : '—'}
      />
    </Card>
  );
}

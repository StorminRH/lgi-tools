import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { ResourceRow } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import { formatIsk, formatPct, formatQuantity } from '@/lib/format';
import { marginToneClass } from '../industry-styles';
import type { BlueprintPricing, BlueprintStructure } from '../types';

// Presentational cost panel, shared by the streamed priced view and its
// Suspense fallback so the layout is identical the moment the shell paints and
// when prices stream in. `pricing === null` is the loading/fallback state: rows
// come from the (already-known) structure with "—" placeholders.

const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto_auto]';

// name | quantity (muted) | extended ISK cost. One row primitive for both the
// priced and the skeleton states.
function CostRow({
  name,
  quantity,
  extendedCost,
}: {
  name: string;
  quantity: number;
  extendedCost: number | null;
}) {
  return (
    <ResourceRow
      colsClass={ROW_COLS}
      name={name}
      meta={`× ${formatQuantity(quantity)}`}
      value={formatIsk(extendedCost)}
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

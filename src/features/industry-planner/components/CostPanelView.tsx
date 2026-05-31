import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { ResourceRow } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk, formatPct, formatQuantity } from '@/lib/format';
import {
  aggregateConfidence,
  confidenceHeadline,
  marginToneClass,
  priceConfidence,
  type ConfidenceInput,
  type RowConfidence,
} from '../industry-styles';
import type { BlueprintPricing, BlueprintStructure, MaterialCostRow } from '../types';

// Presentational cost panel, shared by the streamed priced view and its
// Suspense fallback so the layout is identical the moment the shell paints and
// when prices stream in. `pricing === null` is the loading/fallback state: rows
// come from the (already-known) structure with "—" placeholders.

const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto_auto]';

// One priced (or skeleton) ledger line, independent of whether prices have
// streamed in yet. `confidence` is filled only once the client has a clock
// (see CostPanel) and a real price row — the skeleton and server prerender
// leave it null and show no badge.
type LedgerRow = {
  typeId: number;
  name: string;
  quantity: number;
  extendedCost: number | null;
  confidence: RowConfidence | null;
};

// icon + name (+ confidence badge) | quantity (muted) | extended ISK cost.
// One row primitive for both the priced and the skeleton states.
function CostRow({ name, quantity, extendedCost, typeId, confidence }: LedgerRow) {
  return (
    <ResourceRow
      colsClass={ROW_COLS}
      name={
        <span className="flex items-center gap-2 min-w-0">
          <TypeIcon typeId={typeId} size={32} mono={name.slice(0, 2)} />
          <span className="truncate">{name}</span>
          {confidence && <PriceConfidence level={confidence.level} reasons={confidence.reasons} />}
        </span>
      }
      meta={`× ${formatQuantity(quantity)}`}
      value={formatIsk(extendedCost)}
    />
  );
}

// The price signals a confidence verdict needs, pulled off a priced row.
function confidenceInput(r: MaterialCostRow): ConfidenceInput {
  return {
    source: r.source,
    buyVolume: r.buyVolume,
    unitBuy: r.unitBuy,
    staleAfterMs: r.staleAfterMs,
  };
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="text-[13px] font-semibold text-isk whitespace-nowrap">{value}</div>
    </div>
  );
}

function Summary({ pricing, now }: { pricing: BlueprintPricing | null; now: number | null }) {
  if (!pricing) {
    return (
      <div className="px-[18px] py-[14px] border-b border-border">
        <div className="text-[9px] uppercase tracking-[0.16em] text-muted">Margin (before fees)</div>
        <div className="text-[20px] font-semibold text-muted">Calculating…</div>
      </div>
    );
  }
  const { margin, marginPct, inputCost, revenue, incomplete } = pricing.summary;
  const aggregate =
    now === null ? null : aggregateConfidence(pricing.rows.map(confidenceInput), now);
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
        {aggregate && (
          <div className="flex items-center gap-[7px] text-[11px] text-text mt-1.5">
            <PriceConfidence level={aggregate.level} />
            <span>
              {confidenceHeadline(aggregate.level)} — {aggregate.summary}
            </span>
          </div>
        )}
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
  now = null,
}: {
  pricing: BlueprintPricing | null;
  structure: BlueprintStructure;
  // True while the client is fetching fresh prices for stale/missing rows.
  refreshing?: boolean;
  // Client clock (ms) for freshness; null on the server prerender / skeleton,
  // where confidence badges are withheld (matches PriceFreshness).
  now?: number | null;
}) {
  // Unify the priced and skeleton states into one ledger shape, then bucket by
  // source category so the panel renders ordered sections with subtotals.
  const rows: LedgerRow[] =
    pricing !== null
      ? pricing.rows.map((r) => ({
          typeId: r.typeId,
          name: r.name,
          quantity: r.quantity,
          extendedCost: r.extendedCost,
          confidence: now === null ? null : priceConfidence(confidenceInput(r), now),
        }))
      : structure.flatMaterials.map((m) => ({
          typeId: m.typeId,
          name: structure.materialNames[m.typeId] ?? `Type ${m.typeId}`,
          quantity: m.quantity,
          extendedCost: null,
          confidence: null,
        }));

  const byCategory = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const cat = structure.materialCategory[r.typeId] ?? 'Other Materials';
    const list = byCategory.get(cat);
    if (list) list.push(r);
    else byCategory.set(cat, [r]);
  }

  return (
    <Card>
      <Summary pricing={pricing} now={now} />
      <SectionHeader label="Raw Materials" hint={refreshing ? 'Jita buy · updating…' : 'Jita buy'} />
      {rows.length > 0 ? (
        structure.materialCategories
          .filter((c) => byCategory.has(c.label))
          .map((cat) => {
            const catRows = byCategory.get(cat.label) ?? [];
            const subtotal = catRows.some((r) => r.extendedCost !== null)
              ? catRows.reduce((s, r) => s + (r.extendedCost ?? 0), 0)
              : null;
            return (
              <div key={cat.label}>
                <SectionHeader
                  label={<Pill tone={cat.tone}>{cat.label}</Pill>}
                  hint={subtotal !== null ? formatIsk(subtotal) : undefined}
                />
                {catRows.map((row) => (
                  <CostRow
                    key={row.typeId}
                    typeId={row.typeId}
                    name={row.name}
                    quantity={row.quantity}
                    extendedCost={row.extendedCost}
                    confidence={row.confidence}
                  />
                ))}
              </div>
            );
          })
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

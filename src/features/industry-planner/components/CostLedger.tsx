'use client';

import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { ResourceRow } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk, formatQuantity } from '@/lib/format';
import type { RowConfidence } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { usePricing } from './PricingProvider';

// The raw-materials cost breakdown, grouped by source category (minerals, ice,
// moon, …) with per-category subtotals and a total. The margin headline lifted
// into the hero in 3.1.2; this keeps the detailed sourcing view below the
// cascade (decision record #2). Reads the shared pricing store, so it updates
// as on-demand refreshes land; before prices arrive it shows the known
// materials with "—" placeholders and no badges.

const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto_auto]';

type LedgerRow = {
  typeId: number;
  name: string;
  quantity: number;
  extendedCost: number | null;
  confidence: RowConfidence | null;
};

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

export function CostLedger({ structure }: { structure: BlueprintStructure }) {
  const { pricing, refreshing, confidenceFor } = usePricing();

  // Unify the priced and pre-seed states into one ledger shape, then bucket by
  // source category so the panel renders ordered sections with subtotals.
  const rows: LedgerRow[] =
    pricing !== null
      ? pricing.rows.map((r) => ({
          typeId: r.typeId,
          name: r.name,
          quantity: r.quantity,
          extendedCost: r.extendedCost,
          confidence: confidenceFor(r.typeId),
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

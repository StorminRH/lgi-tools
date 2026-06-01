'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { Pill } from '@/components/ui/pill';
import { ResourceRow } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk, formatQuantity } from '@/lib/format';
import type { BlueprintStructure } from '../types';
import { usePricing } from './PricingProvider';

// The raw-materials cost breakdown, grouped by source category (minerals, ice,
// moon, …) with per-category subtotals and a total. The margin headline lifted
// into the hero in 3.1.2; this keeps the detailed sourcing view below the
// cascade (decision record #2). Collapsed by default now that the consolidated
// build view carries a raw-materials tier — expand it for the full categorised
// cost breakdown. Reads the shared pricing store, so it updates as on-demand
// refreshes land; before prices arrive it shows the known materials with "—".

const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto_auto]';

type LedgerRow = {
  typeId: number;
  name: string;
  quantity: number;
  extendedCost: number | null;
  // True while the live price is being confirmed — the value shows dimmed, then
  // flashes to the confirmed value when it lands.
  pending: boolean;
};

function CostRow({ name, quantity, extendedCost, typeId, pending }: LedgerRow) {
  return (
    <ResourceRow
      colsClass={ROW_COLS}
      name={
        <span className="flex items-center gap-2 min-w-0">
          <TypeIcon typeId={typeId} size={32} mono={name.slice(0, 2)} />
          <span className="truncate">{name}</span>
        </span>
      }
      meta={`× ${formatQuantity(quantity)}`}
      value={
        <span className={cn('transition-opacity duration-300', pending ? 'opacity-40' : 'opacity-100')}>
          {formatIsk(extendedCost)}
        </span>
      }
    />
  );
}

export function CostLedger({ structure }: { structure: BlueprintStructure }) {
  const { pricing, refreshing, isPending } = usePricing();

  // Unify the priced and pre-seed states into one ledger shape, then bucket by
  // source category so the panel renders ordered sections with subtotals.
  const rows: LedgerRow[] =
    pricing !== null
      ? pricing.rows.map((r) => ({
          typeId: r.typeId,
          name: r.name,
          quantity: r.quantity,
          extendedCost: r.extendedCost,
          pending: isPending(r.typeId),
        }))
      : structure.flatMaterials.map((m) => ({
          typeId: m.typeId,
          name: structure.materialNames[m.typeId] ?? `Type ${m.typeId}`,
          quantity: m.quantity,
          extendedCost: null,
          pending: false,
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
      <Collapsible
        defaultOpen={false}
        headerClassName="bg-section"
        header={
          <>
            <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-muted shrink-0">
              Raw Materials
            </span>
            <span className="ml-auto flex items-center gap-2.5">
              <span className="text-[9px] uppercase tracking-[0.08em] text-muted">
                {refreshing ? 'Jita buy · updating…' : 'Jita buy'}
              </span>
              <span className="text-[12px] text-isk font-medium whitespace-nowrap">
                {pricing !== null ? formatIsk(pricing.summary.inputCost) : '—'}
              </span>
              <span data-chevron className="inline-block text-[9px] text-muted transition-transform">
                ▾
              </span>
            </span>
          </>
        }
      >
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
                      pending={row.pending}
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
      </Collapsible>
    </Card>
  );
}

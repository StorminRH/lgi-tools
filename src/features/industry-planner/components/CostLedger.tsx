'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { ResourceRow } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk, formatQuantity } from '@/lib/format';
import type { BlueprintStructure } from '../types';
import { usePricing } from './PricingProvider';

// The raw-materials cost breakdown as a grid of source-category cards
// (minerals, ice, moon, …) — three per row, wrapping to as many rows as it
// takes, with a grand total below. One of the build-area views (the "Raw
// ledger" toggle). Reads the shared pricing store, so costs update as on-demand
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
  // source category so the grid renders one card per present category.
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

  const present = structure.materialCategories.filter((c) => byCategory.has(c.label));

  if (present.length === 0) {
    return (
      <Card>
        <div className="px-3.5 py-3 text-[11px] text-muted">No raw materials to price.</div>
      </Card>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-[22px] items-start sm:grid-cols-2 lg:grid-cols-3">
        {present.map((cat) => {
          const catRows = byCategory.get(cat.label) ?? [];
          const subtotal = catRows.some((r) => r.extendedCost !== null)
            ? catRows.reduce((s, r) => s + (r.extendedCost ?? 0), 0)
            : null;
          return (
            <Card key={cat.label}>
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
            </Card>
          );
        })}
      </div>
      <div className="mt-[22px]">
        <Card>
          <SectionFooter
            label={refreshing ? 'Total input cost · updating…' : 'Total input cost'}
            value={pricing !== null ? formatIsk(pricing.summary.inputCost) : '—'}
          />
        </Card>
      </div>
    </div>
  );
}

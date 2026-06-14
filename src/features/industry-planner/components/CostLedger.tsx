'use client';

import { useMemo, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { HoverPopover } from '@/components/ui/hover-popover';
import { Pill } from '@/components/ui/pill';
import { ResourceRow } from '@/components/ui/row';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import { TypeIcon } from '@/components/ui/type-icon';
import { DEFAULT_FEE_RATES } from '@/data/industry-math/fees';
import { formatIsk, formatPct, formatQuantity } from '@/lib/format';
import { computeBatchMaterials } from '../build-batch';
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

const FEE_COLS = 'grid-cols-[minmax(0,1fr)_auto]';

// A fraction as a clean percentage label ("0.0025" → "0.25%", "0.04" → "4%").
function ratePct(fraction: number): string {
  return `${parseFloat((fraction * 100).toFixed(4)).toString()}%`;
}

// One itemized fee line: label on the left, ISK on the right. Null values format
// to an em dash, preserving the leaf's absent-vs-0.0 honesty in the display.
function FeeRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return <ResourceRow colsClass={FEE_COLS} name={label} value={value} />;
}

export function CostLedger({ structure }: { structure: BlueprintStructure }) {
  const { pricing, refreshing, isPending } = usePricing();
  const net = pricing?.net ?? null;

  // Pre-seed rows (before any price lands): the whole-run batch quantities with
  // no cost yet. Memoised so the brief pre-price window doesn't re-walk the tree
  // on every render.
  const preSeedRows = useMemo<LedgerRow[]>(
    () =>
      computeBatchMaterials(structure.tree).map((m) => ({
        typeId: m.typeId,
        name: structure.materialNames[m.typeId] ?? `Type ${m.typeId}`,
        quantity: m.quantity,
        extendedCost: null,
        pending: false,
      })),
    [structure.tree, structure.materialNames],
  );

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
      : preSeedRows;

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

      {net !== null && (
        <div className="mt-[22px]">
          <Card>
            <SectionHeader
              label="Build fees & net margin"
              hint="top job · NPC station · ME 0"
            />
            <FeeRow
              label="Estimated item value (EIV)"
              value={formatIsk(net.jobFee.estimatedItemValue)}
            />
            <FeeRow
              label={`System cost (${
                net.systemCostIndex === null
                  ? 'no index'
                  : `${(net.systemCostIndex * 100).toFixed(2)}%`
              })`}
              value={
                net.jobFee.missingSystemCostIndex
                  ? 'no cost index'
                  : formatIsk(net.jobFee.jobGrossCost)
              }
            />
            <FeeRow
              label={`Facility tax (${ratePct(DEFAULT_FEE_RATES.facilityTax)} of EIV)`}
              value={formatIsk(net.jobFee.facilityTax)}
            />
            <FeeRow
              label={`SCC surcharge (${ratePct(DEFAULT_FEE_RATES.sccSurcharge)} of EIV)`}
              value={formatIsk(net.jobFee.sccSurcharge)}
            />
            <FeeRow
              label={
                <HoverPopover
                  label="About the install fee"
                  trigger={
                    <span className="border-b border-dotted border-border-idle cursor-help">
                      Install fee (top job)
                    </span>
                  }
                >
                  <span className="text-[10px] text-muted">
                    EVE installation fee for the final build job only. Intermediate component
                    jobs also incur their own fees — not yet included, so true total fees are
                    higher and this net margin is a slight overestimate.
                  </span>
                </HoverPopover>
              }
              value={formatIsk(net.jobFee.total)}
            />
            <FeeRow
              label={`Sales tax (${ratePct(DEFAULT_FEE_RATES.salesTax)})`}
              value={formatIsk(net.sellSide.salesTax)}
            />
            <FeeRow
              label={`Broker fee (${ratePct(DEFAULT_FEE_RATES.brokerFee)})`}
              value={formatIsk(net.sellSide.brokerFee)}
            />
            <FeeRow label="Net cost" value={formatIsk(net.netCost)} />
            <SectionFooter
              label="Net margin (excl. sub-job fees)"
              value={`${formatIsk(net.netMargin)}${
                net.netMarginPct !== null ? ` (${formatPct(net.netMarginPct)})` : ''
              }`}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

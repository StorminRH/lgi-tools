'use client';

import Link from 'next/link';
import { use } from 'react';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { SortableTable, type SortableColumn } from '@/components/ui/sortable-table';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk, formatQuantity } from '@/lib/format';
import type { DirectInputRow, DirectInputsView } from '../browse-types';
import { priceConfidence } from '../industry-styles';
import { useCascadeNav } from './cascade-context';

// Per-tab fetch cache for fanned columns, keyed by blueprint id. A cached
// promise is read with `use()` (Suspense) — so a re-opened column is instant
// and we never set state in an effect (which the enforced react-hooks rules
// reject). Errors resolve to `{ ok: false }` rather than throwing, so a failed
// column shows an inline message without an error boundary.
type ColumnResult = { ok: true; view: DirectInputsView } | { ok: false };
const cache = new Map<number, Promise<ColumnResult>>();

export function loadInputs(blueprintId: number): Promise<ColumnResult> {
  let promise = cache.get(blueprintId);
  if (!promise) {
    promise = fetch(`/api/industry/inputs?blueprint=${blueprintId}`)
      .then((r): Promise<ColumnResult> =>
        r.ok
          ? r.json().then((view: DirectInputsView) => ({ ok: true, view }))
          : Promise.resolve({ ok: false }),
      )
      .catch((): ColumnResult => ({ ok: false }));
    cache.set(blueprintId, promise);
    // Don't wedge a column on a transient failure: evict a failed result once
    // it settles so re-opening the row refetches (the "try again" message is
    // only honest if a retry actually re-hits the network).
    void promise.then((res) => {
      if (!res.ok) cache.delete(blueprintId);
    });
  }
  return promise;
}

const ROW =
  'grid items-center gap-4 px-3 py-2 border-b border-border-soft last:border-b-0 text-[12px]';
const GRID = 'grid-cols-[32px_minmax(0,1fr)_auto_auto_13px_16px]';

// Loading skeleton — sized to a column so the cascade doesn't jump as data
// lands. Used as the Suspense fallback by BrowseCascade.
export function InputColumnLoading() {
  return (
    <div className="text-[10px] tracking-[0.12em] uppercase text-muted px-3 py-6">
      Loading inputs…
    </div>
  );
}

// One fanned column: a blueprint's direct, priced inputs as a (non-sortable)
// SortableTable. Buildable rows fan the next column at `writeDepth`; raw rows
// are terminal. Confidence is derived here against the live clock, matching the
// detail page (the query stays clock-free).
export function InputColumn({
  blueprintId,
  writeDepth,
}: {
  blueprintId: number;
  writeDepth: number;
}) {
  const { path, openFrom, now } = useCascadeNav();
  const result = use(loadInputs(blueprintId));

  if (!result.ok) {
    return (
      <div className="px-3 py-6">
        <EmptyState>Couldn’t load inputs — try again.</EmptyState>
      </div>
    );
  }

  const { view } = result;

  const columns: SortableColumn<DirectInputRow>[] = [
    {
      key: 'icon',
      label: '',
      sortable: false,
      render: (r) => <TypeIcon typeId={r.typeId} size={32} mono={r.name.slice(0, 2)} />,
    },
    {
      key: 'name',
      label: 'Input',
      sortable: false,
      render: (r) => <span className="block truncate text-name">{r.name}</span>,
    },
    {
      key: 'qty',
      label: 'Qty',
      sortable: false,
      align: 'right',
      render: (r) => (
        <span className="tabular-nums text-muted whitespace-nowrap">{formatQuantity(r.quantity)}</span>
      ),
    },
    {
      key: 'cost',
      label: 'Ext. cost',
      sortable: false,
      align: 'right',
      render: (r) => <span className="tabular-nums whitespace-nowrap">{formatIsk(r.extendedCost)}</span>,
    },
    {
      key: 'conf',
      label: 'Conf',
      sortable: false,
      render: (r) => {
        // Until the client clock lands, render an unknown dot rather than read
        // the wall clock during render (purity rule + Cache Components).
        const conf =
          now === null
            ? { level: 'unknown' as const, reasons: undefined }
            : priceConfidence(
                { source: r.source, buyVolume: r.buyVolume, unitBuy: r.unitBuy, staleAfterMs: r.staleAfterMs },
                now,
              );
        return (
          <span className="flex justify-center">
            <PriceConfidence level={conf.level} reasons={conf.reasons} />
          </span>
        );
      },
    },
    {
      key: 'fan',
      label: '',
      sortable: false,
      render: (r) => {
        if (!r.buildable || r.childBlueprintTypeId === null) return null;
        const open = path[writeDepth] === String(r.childBlueprintTypeId);
        return <span className={cn('text-center', open ? 'text-isk' : 'text-muted')}>▸</span>;
      },
    },
  ];

  return (
    <div>
      <div className="cascade-col-label">
        <span className="truncate">{view.productName} — direct inputs</span>
        <Link
          href={`/industry/${view.blueprintTypeId}`}
          scroll={false}
          className="ml-auto shrink-0 text-isk hover:underline normal-case tracking-normal"
        >
          open full planner →
        </Link>
      </div>
      <SortableTable<DirectInputRow>
        columns={columns}
        rows={view.rows}
        gridColsClass={GRID}
        sortKey={null}
        sortDir="desc"
        basePath="/industry"
        currentParams={{}}
        getRowKey={(r) => r.typeId}
        emptyState="No inputs."
        renderRow={({ row, cells, key, gridColsClass }) => {
          const buildable = row.buildable && row.childBlueprintTypeId !== null;
          if (!buildable) {
            return (
              <div key={key} className={cn(ROW, gridColsClass)}>
                {cells}
                {/* trailing fan slot stays empty for terminal rows */}
              </div>
            );
          }
          const childId = row.childBlueprintTypeId as number;
          const open = path[writeDepth] === String(childId);
          return (
            <button
              key={key}
              type="button"
              onClick={() => openFrom(writeDepth, childId)}
              aria-expanded={open}
              className={cn(
                ROW,
                'w-full text-left cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.018)]',
                open && 'bg-[rgba(61,214,140,0.06)] shadow-[inset_2px_0_0_var(--color-isk)]',
                gridColsClass,
              )}
            >
              {cells}
            </button>
          );
        }}
      />
    </div>
  );
}

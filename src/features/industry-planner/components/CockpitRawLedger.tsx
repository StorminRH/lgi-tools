import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LivePrice } from '@/components/ui/live-price';
import { EntityRow } from '@/components/ui/row';
import { TypeIcon } from '@/components/type-icon';
import { itemImage } from '@/data/eve-data/type-images';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import type { BlueprintPricing, BlueprintStructure, MaterialCostRow } from '../types';

// The whole-run raw-material bill, shown when the build plan's "Raw ledger" header
// toggle is expanded. One independent column per source category, each its own
// card under a `category · count ···· subtotal` header (the same shape as the
// build-plan tier columns), rows most-expensive first. The columns flow as a CSS
// multi-column layout so each packs to its own height — short categories tuck
// under tall ones instead of leaving a grid-row gap. Reuses the already-batched,
// already-priced `pricing.rows` (ALWAYS the Raw buy list, whichever basis the
// summary shows — 3.7.21.1) and the structure's category map, so nothing is
// recomputed.

// Mirrors the build-plan TierRow grid/typography so the two read as one system.
interface CategoryGroup {
  label: string;
  rows: MaterialCostRow[];
  total: number;
}

// Bucket the priced rows by source category, in the structure's display order,
// most-expensive row first within each. Any category not in the ordered list
// (shouldn't happen — both derive from the same raw leaf set) is appended so no
// row is ever dropped.
function groupByCategory(
  pricing: BlueprintPricing,
  structure: BlueprintStructure,
): CategoryGroup[] {
  const byCategory = new Map<string, MaterialCostRow[]>();
  for (const row of pricing.rows) {
    const label = structure.materialCategory[row.typeId] ?? 'Other';
    const list = byCategory.get(label) ?? [];
    list.push(row);
    byCategory.set(label, list);
  }
  const orderedLabels = [
    ...structure.materialCategories.map((c) => c.label),
    ...[...byCategory.keys()].filter(
      (l) => !structure.materialCategories.some((c) => c.label === l),
    ),
  ];
  return orderedLabels
    .filter((label) => byCategory.has(label))
    .map((label) => {
      const rows = byCategory
        .get(label)!
        .sort((a, b) => (b.extendedCost ?? 0) - (a.extendedCost ?? 0));
      return { label, rows, total: rows.reduce((s, r) => s + (r.extendedCost ?? 0), 0) };
    });
}

function CategoryColumn({ group, refreshing }: { group: CategoryGroup; refreshing: boolean }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <div className="mb-2 flex items-center gap-2 whitespace-nowrap text-label font-semibold uppercase tracking-eyebrow text-muted">
        {group.label}
        <span className="text-faint">· {group.rows.length}</span>
        <span className="h-0 flex-1 border-b border-dotted border-border-idle" />
        <LivePrice
          value={formatIsk(group.total)}
          pending={refreshing}
          className="text-ui font-semibold tracking-normal text-isk"
        />
      </div>
      <Card>
        {group.rows.map((row) => (
          <EntityRow
            key={row.typeId}
            colsClass="grid-cols-[30px_minmax(0,1fr)_auto]"
            className="min-h-[44px] px-3 py-[9px]"
            leading={<TypeIcon {...itemImage(row.typeId)} size={30} mono={row.name.slice(0, 2)} />}
            name={<div className="flex min-w-0 flex-col gap-px">
              <span className="line-clamp-2 break-words font-data text-ui font-medium leading-[1.28] text-name">
                {row.name}
              </span>
              <span className="truncate font-data text-label uppercase tracking-label text-muted">
                {row.unitBuy !== null ? `${formatIsk(row.unitBuy)} / unit` : 'no price'}
              </span>
            </div>}
            trailing={<span className="flex flex-col items-end gap-px text-right">
              <span className="whitespace-nowrap font-data text-ui tabular-nums text-muted">
                × {formatQuantity(row.quantity)}
              </span>
              <LivePrice
                value={row.extendedCost !== null ? formatIsk(row.extendedCost) : '—'}
                pending={refreshing}
                className="whitespace-nowrap text-ui text-text"
              />
            </span>}
          />
        ))}
      </Card>
    </div>
  );
}

/** Renders raw-material quantities, owned coverage, and cost totals for the active build plan. */
export function CockpitRawLedger({
  pricing,
  structure,
  refreshing,
}: {
  pricing: BlueprintPricing | null;
  structure: BlueprintStructure;
  refreshing: boolean;
}) {
  const groups = pricing ? groupByCategory(pricing, structure) : [];

  if (groups.length === 0) {
    return <EmptyState>No priced raw materials yet.</EmptyState>;
  }

  return (
    <div className="columns-[260px] gap-x-5">
      {groups.map((g) => (
        <CategoryColumn key={g.label} group={g} refreshing={refreshing} />
      ))}
    </div>
  );
}

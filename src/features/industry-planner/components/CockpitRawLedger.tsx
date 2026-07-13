import { Card } from '@/components/ui/card';
import { TypeIcon } from '@/components/type-icon';
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
const ROW =
  'grid grid-cols-[30px_minmax(0,1fr)_auto_14px] items-center gap-2.5 px-3 py-[9px] min-h-[44px] border-t border-border-soft first:border-t-0';

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

function CategoryColumn({ group }: { group: CategoryGroup }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <div className="mb-2 flex items-center gap-2 whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted">
        {group.label}
        <span className="text-faint">· {group.rows.length}</span>
        <span className="h-0 flex-1 border-b border-dotted border-border-idle" />
        <span className="text-ui font-semibold tabular-nums tracking-normal text-isk">
          {formatIsk(group.total)}
        </span>
      </div>
      <Card>
        {group.rows.map((row) => (
          <div key={row.typeId} className={ROW}>
            <TypeIcon typeId={row.typeId} size={30} mono={row.name.slice(0, 2)} />
            <div className="flex min-w-0 flex-col gap-px">
              <span className="line-clamp-2 break-words font-mono text-ui font-medium leading-[1.28] text-name">
                {row.name}
              </span>
              <span className="truncate font-mono text-label uppercase tracking-[0.1em] text-muted">
                {row.unitBuy !== null ? `${formatIsk(row.unitBuy)} / unit` : 'no price'}
              </span>
            </div>
            <span className="flex flex-col items-end gap-px text-right">
              <span className="whitespace-nowrap font-mono text-ui tabular-nums text-muted">
                × {formatQuantity(row.quantity)}
              </span>
              <span className="whitespace-nowrap font-mono text-ui tabular-nums text-text">
                {row.extendedCost !== null ? formatIsk(row.extendedCost) : '—'}
              </span>
            </span>
            <span aria-hidden />
          </div>
        ))}
      </Card>
    </div>
  );
}

export function CockpitRawLedger({
  pricing,
  structure,
}: {
  pricing: BlueprintPricing | null;
  structure: BlueprintStructure;
}) {
  const groups = pricing ? groupByCategory(pricing, structure) : [];

  if (groups.length === 0) {
    return <p className="font-body text-ui text-muted">No priced raw materials yet.</p>;
  }

  return (
    <div className="columns-[260px] gap-x-5">
      {groups.map((g) => (
        <CategoryColumn key={g.label} group={g} />
      ))}
    </div>
  );
}

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LivePrice } from '@/components/ui/live-price';
import { EntityRow } from '@/components/ui/row';
import { TypeIcon } from '@/components/type-icon';
import { itemImage } from '@/data/eve-data/type-images';
import { groupBy } from '@/lib/array';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import type { BlueprintPricing, BlueprintStructure, MaterialCostRow } from '../types';
import { ItemNameStack, LedgerColumnHead } from './ledger-parts';

interface CategoryGroup {
  label: string;
  rows: MaterialCostRow[];
  total: number;
}

function groupByCategory(
  pricing: BlueprintPricing,
  structure: BlueprintStructure,
): CategoryGroup[] {
  const byCategory = groupBy(pricing.rows, (row) => structure.materialCategory[row.typeId] ?? 'Other');
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
      <LedgerColumnHead
        label={group.label}
        count={group.rows.length}
        total={group.total}
        pending={refreshing}
      />
      <Card>
        {group.rows.map((row) => (
          <EntityRow
            key={row.typeId}
            colsClass="grid-cols-[30px_minmax(0,1fr)_auto]"
            className="min-h-[44px] px-3 py-[9px]"
            leading={<TypeIcon {...itemImage(row.typeId)} size={30} mono={row.name} />}
            name={<ItemNameStack
              name={row.name}
              label={row.unitBuy !== null ? `${formatIsk(row.unitBuy)} / unit` : 'no price'}
            />}
            trailing={<span className="flex flex-col items-end gap-px text-right">
              <span className="whitespace-nowrap font-data text-ui tabular-nums text-muted">
                × {formatQuantity(row.quantity)}
              </span>
              <LivePrice
                value={formatIsk(row.extendedCost)}
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

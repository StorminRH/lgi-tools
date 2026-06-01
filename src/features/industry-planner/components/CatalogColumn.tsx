import { PriceConfidence } from '@/components/ui/price-confidence';
import { SortableTable, type SortableColumn } from '@/components/ui/sortable-table';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatIsk } from '@/lib/format';
import type { CatalogRow as CatalogRowData } from '../browse-types';
import { defaultDirFor, type CatalogSortKey, type SortDir } from '../catalog-sort';
import { marginToneClass } from '../industry-styles';
import { CatalogRow } from './CatalogRow';

// Cascade column 0: the filterable/sortable catalog of buildable products,
// ranked by margin. Server-rendered (the row interactivity is the CatalogRow
// client island); the icon uses the PRODUCT type, the fan-out + planner link
// use the blueprint type. Sort headers are URL links (handled by SortableTable)
// — the page does the actual sort + top-N slice before rendering.

const GRID = 'grid-cols-[32px_minmax(0,1fr)_auto_auto_13px_16px]';

function marginLabel(margin: number | null): string {
  if (margin === null) return '—';
  return `${margin > 0 ? '+' : ''}${formatIsk(margin)}`;
}

const COLUMNS: SortableColumn<CatalogRowData>[] = [
  {
    key: 'icon',
    label: '',
    sortable: false,
    render: (r) => <TypeIcon typeId={r.productTypeId} size={32} mono={r.name.slice(0, 2)} />,
  },
  {
    key: 'name',
    label: 'Name',
    // Block-level so `truncate` actually clips in the tight 360px column (an
    // inline span won't). Category lives in the filter, not a per-row pill.
    render: (r) => <span className="block truncate text-name">{r.name}</span>,
  },
  {
    key: 'margin',
    label: 'Margin',
    align: 'right',
    render: (r) => (
      <span className={`tabular-nums whitespace-nowrap ${marginToneClass(r.marginPct)}`}>
        {marginLabel(r.margin)}
      </span>
    ),
  },
  {
    key: 'cost',
    label: 'Cost',
    align: 'right',
    render: (r) => <span className="tabular-nums whitespace-nowrap text-muted">{formatIsk(r.inputCost)}</span>,
  },
  {
    key: 'conf',
    label: 'Conf',
    sortable: false,
    render: (r) => (
      <span className="flex justify-center">
        <PriceConfidence level={r.confidence} reasons={r.confidenceSummary ? [r.confidenceSummary] : undefined} />
      </span>
    ),
  },
  {
    key: 'fan',
    label: '',
    sortable: false,
    render: () => <span className="text-center text-muted">▸</span>,
  },
];

export function CatalogColumn({
  rows,
  totalCount,
  sortKey,
  sortDir,
  currentParams,
}: {
  rows: CatalogRowData[];
  totalCount: number;
  sortKey: CatalogSortKey | null;
  sortDir: SortDir;
  currentParams: Record<string, string | undefined>;
}) {
  const label =
    rows.length < totalCount
      ? `Catalog · top ${rows.length.toLocaleString('en-US')} of ${totalCount.toLocaleString('en-US')} — narrow with filters`
      : `Catalog · ${totalCount.toLocaleString('en-US')} blueprints`;

  return (
    <div>
      <div className="cascade-col-label">{label}</div>
      <SortableTable<CatalogRowData>
        columns={COLUMNS}
        rows={rows}
        gridColsClass={GRID}
        sortKey={sortKey}
        sortDir={sortDir}
        basePath="/industry"
        currentParams={currentParams}
        defaultDirFor={(k) => defaultDirFor(k as CatalogSortKey)}
        getRowKey={(r) => r.blueprintTypeId}
        emptyState="No blueprints match this filter combination."
        renderRow={({ row, cells, key, gridColsClass }) => (
          <CatalogRow key={key} blueprintTypeId={row.blueprintTypeId} gridColsClass={gridColsClass}>
            {cells}
          </CatalogRow>
        )}
      />
    </div>
  );
}

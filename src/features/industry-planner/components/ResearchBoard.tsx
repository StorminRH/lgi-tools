'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiTile, SectionPanel } from '@/components/ui/readout';
import { SegmentedControl } from '@/components/ui/segmented';
import { SheetHeading, SheetLayout } from '@/components/ui/sheet-layout';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { eyebrow } from '@/components/ui/type-roles';
import { useRefreshHistoryOnView } from '@/data/market-history/use-refresh-on-view';
import { useRefreshOnView } from '@/data/market-prices/use-refresh-on-view';
import { itemImage } from '@/data/eve-data/type-images';
import { useTypeNames } from '@/data/eve-data/use-type-names';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatPct } from '@/lib/format/number';
import { initials } from '@/lib/format/names';
import type { RecentBlueprint } from '../recent-blueprints';
import {
  formatClearDays,
  researchRow,
  type ResearchRow,
  type ResearchSortKey,
  sortResearchRows,
} from '../research-view';
import { useRecentBlueprints } from '../use-recent-blueprints';
import { useWatchlist } from '../use-watchlist';
import { isWatched } from '../watchlist';
import { BlueprintSearchPanel } from './BlueprintSearch';

const SORT_OPTIONS: { value: ResearchSortKey; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'volume', label: 'Volume' },
  { value: 'spread', label: 'Spread' },
  { value: 'sell', label: 'Price' },
];

/** Products to compare before committing a build: Jita prices, demand, and how fast the market clears. */
export function ResearchBoard() {
  const { watchlist, toggle } = useWatchlist();
  const recent = useRecentBlueprints();
  const list = watchlist ?? [];
  const suggestions = (recent ?? []).filter((entry) => !isWatched(list, entry.typeId)).slice(0, 5);

  return (
    <SheetLayout
      aside={
        <>
          <SheetHeading title="Market research">
            Jita prices, demand and clear time for products you might build.
          </SheetHeading>
          <BlueprintSearchPanel
            key={list.length}
            label="Watch a product"
            placeholder="Blueprint or reaction"
            onPick={(blueprint) => {
              if (!isWatched(list, blueprint.typeId)) toggle(blueprint);
            }}
          />
          <dl className="grid grid-cols-2 gap-2 xl:grid-cols-1">
            <KpiTile label="Watching" tone="text-isk">
              {watchlist === null ? '…' : list.length}
            </KpiTile>
          </dl>
          {suggestions.length > 0 && <RecentSuggestions entries={suggestions} onWatch={toggle} />}
        </>
      }
    >
      {watchlist === null ? (
        <SectionPanel title="Watchlist">
          <EmptyState> </EmptyState>
        </SectionPanel>
      ) : (
        <WatchlistMarket key={list.map((entry) => entry.typeId).join(',')} entries={list} onRemove={toggle} />
      )}
    </SheetLayout>
  );
}

function RecentSuggestions({
  entries,
  onWatch,
}: {
  entries: RecentBlueprint[];
  onWatch: (entry: RecentBlueprint) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={eyebrow({ size: 'micro' })}>From your recent plans</h2>
      <ul className="flex list-none flex-col gap-1">
        {entries.map((entry) => (
          <li key={entry.typeId} className="flex min-w-0 items-center gap-2.5">
            <TypeIcon {...itemImage(entry.productTypeId)} size={22} mono={initials(entry.name)} />
            <span className="min-w-0 flex-1 truncate text-ui text-text">{entry.name}</span>
            <Button variant="ghost" size="sm" onClick={() => onWatch(entry)} aria-label={`Watch ${entry.name}`}>
              + Watch
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Keyed by the watched ids: the refresh hooks read their ids once per run.
function WatchlistMarket({
  entries,
  onRemove,
}: {
  entries: RecentBlueprint[];
  onRemove: (entry: RecentBlueprint) => void;
}) {
  const [sort, setSort] = useState<ResearchSortKey>('score');
  const productIds = useMemo(() => entries.map((entry) => entry.productTypeId), [entries]);
  const enabled = productIds.length > 0;
  const { prices, refreshing } = useRefreshOnView(productIds, { enabled });
  const { inputs } = useRefreshHistoryOnView(productIds, { enabled });
  const names = useTypeNames(productIds);

  const rows = useMemo(
    () =>
      sortResearchRows(
        entries.map((entry) =>
          researchRow(
            entry,
            names[String(entry.productTypeId)] ?? entry.name,
            prices.get(entry.productTypeId),
            inputs.get(entry.productTypeId),
          ),
        ),
        sort,
      ),
    [entries, names, prices, inputs, sort],
  );

  return (
    <SectionPanel
      title="Watchlist"
      meta={
        entries.length > 1 ? (
          <SegmentedControl
            label="Sort watchlist"
            density="compact"
            value={sort}
            onChange={(value) => setSort(value as ResearchSortKey)}
            options={SORT_OPTIONS}
          />
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <EmptyState>Nothing watched yet. Search for a product to start comparing.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <ResearchTable
            rows={rows}
            pending={refreshing && prices.size === 0}
            onRemove={(row) => {
              const entry = entries.find((candidate) => candidate.typeId === row.blueprintTypeId);
              if (entry !== undefined) onRemove(entry);
            }}
          />
        </div>
      )}
    </SectionPanel>
  );
}

function ResearchTable({
  rows,
  pending,
  onRemove,
}: {
  rows: ResearchRow[];
  pending: boolean;
  onRemove: (row: ResearchRow) => void;
}) {
  const figure = (value: string) => (pending ? '…' : value);
  const columns = [
    {
      key: 'product',
      label: 'Product',
      rowHeader: true,
      render: (row) => (
        <Link
          href={`/industry/${row.blueprintTypeId}`}
          className="flex min-w-0 items-center gap-2.5 text-name no-underline hover:text-isk"
        >
          <TypeIcon {...itemImage(row.productTypeId)} size={26} mono={initials(row.name)} />
          <span className="truncate">{row.name}</span>
        </Link>
      ),
    },
    { key: 'sell', label: 'Sell', align: 'right', className: 'tabular-nums text-isk', render: (row) => figure(formatIsk(row.sell)) },
    { key: 'buy', label: 'Buy', align: 'right', className: 'tabular-nums text-muted', render: (row) => figure(formatIsk(row.buy)) },
    { key: 'spread', label: 'Spread', align: 'right', className: 'tabular-nums', render: (row) => figure(formatPct(row.spreadPct)) },
    {
      key: 'volume',
      label: 'Vol / day',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => figure(row.dailyVolume === null ? '—' : formatCompactQuantity(row.dailyVolume)),
    },
    {
      key: 'score',
      label: 'Score',
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-name">{figure(row.score === null ? '—' : String(row.score))}</span>
          <span className="text-micro text-faint">{formatClearDays(row.clearDays)}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      label: <span className="sr-only">Actions</span>,
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className="inline-flex items-center gap-3">
          <Link href={`/industry/${row.blueprintTypeId}`} className="text-isk no-underline hover:text-name">
            Plan →
          </Link>
          <Button
            variant="bare"
            onClick={() => onRemove(row)}
            aria-label={`Stop watching ${row.name}`}
            className="cursor-pointer text-muted hover:text-tone-red"
          >
            ✕
          </Button>
        </span>
      ),
    },
  ] satisfies readonly StaticTableColumn<ResearchRow>[];
  return (
    <StaticTable
      ariaLabel="Watched products"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.blueprintTypeId}
      className="min-w-[640px]"
    />
  );
}

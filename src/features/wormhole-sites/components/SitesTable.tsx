import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { SortableTable, type SortableColumn } from '@/components/ui/sortable-table';
import { UrlSync } from '@/components/ui/url-sync';
import { formatClassRange, gasClassRange } from '../gas-classes';
import { defaultDirFor, siteScramTotal, sortSitesForTable, type SortDir, type SortableKey } from '../sort';
import type { SiteDetail } from '../types';
import { SiteDetailsBody } from './SiteDetailsBody';
import { CLASS_TONE, SITE_TYPE_LABEL, SITE_TYPE_TONE } from './wormhole-styles';

function formatIskShort(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B`;
  if (isk >= 1_000_000) return `${(isk / 1_000_000).toFixed(1)}M`;
  return `${(isk / 1_000).toFixed(0)}K`;
}

function isWaveDriven(s: SiteDetail): boolean {
  return s.siteType === 'combat' || s.siteType === 'relic' || s.siteType === 'data';
}

function primaryIskFor(s: SiteDetail): number | null {
  return isWaveDriven(s) ? s.blueLootIsk : s.resourceValueIsk;
}

const COLUMNS: SortableColumn<SiteDetail>[] = [
  {
    key: 'name',
    label: 'Name',
    render: (s) => <span className="truncate text-name">{s.name}</span>,
  },
  {
    key: 'type',
    label: 'Type',
    render: (s) => (
      <Pill tone={SITE_TYPE_TONE[s.siteType]} size="sm">
        {SITE_TYPE_LABEL[s.siteType]}
      </Pill>
    ),
  },
  {
    key: 'isk',
    label: 'ISK',
    align: 'right',
    render: (s) => <span className="tabular-nums">{formatIskShort(primaryIskFor(s))}</span>,
  },
  {
    key: 'blueLoot',
    label: 'Blue loot',
    align: 'right',
    render: (s) => <span className="tabular-nums text-muted">{formatIskShort(s.blueLootIsk)}</span>,
  },
  {
    key: 'scrams',
    label: 'Scrams',
    align: 'right',
    render: (s) => {
      const total = siteScramTotal(s);
      return (
        <span className={`tabular-nums ${total === 0 ? 'text-muted' : ''}`}>{total === 0 ? '—' : total}</span>
      );
    },
  },
  {
    key: 'class',
    label: 'Class',
    render: (s) => {
      if (s.wormholeClass) {
        return <Pill tone={CLASS_TONE[s.wormholeClass]} size="sm">{s.wormholeClass}</Pill>;
      }
      if (s.siteType === 'gas') {
        const range = gasClassRange(s.name);
        if (range) {
          // Tone tracks the MIN class so the colour reads as "this is
          // available from that class up". C1/C2 → green, C3 → orange, etc.
          return (
            <Pill tone={CLASS_TONE[range.min]} size="sm">{formatClassRange(range)}</Pill>
          );
        }
      }
      return <span className="text-muted">—</span>;
    },
  },
];

export function SitesTable({
  sites,
  sortKey,
  sortDir,
  currentParams,
}: {
  sites: SiteDetail[];
  sortKey: SortableKey | null;
  sortDir: SortDir;
  currentParams: Record<string, string | undefined>;
}) {
  const sorted = sortSitesForTable(sites, sortKey, sortDir);

  return (
    <SortableTable<SiteDetail>
      columns={COLUMNS}
      rows={sorted}
      gridColsClass="grid-cols-[2.4fr_0.9fr_0.7fr_0.8fr_0.6fr_0.7fr]"
      sortKey={sortKey}
      sortDir={sortDir}
      basePath="/sites"
      currentParams={currentParams}
      defaultDirFor={(k) => defaultDirFor(k as SortableKey)}
      getRowKey={(s) => s.id}
      emptyState="No sites match this filter combination."
      renderRow={({ row, cells, key, gridColsClass }) => (
        <UrlSync
          key={key}
          basePath="/sites"
          entityId={row.id}
          className="border-b border-border-soft last:border-b-0"
        >
          <details className="sites-table-row">
            <summary
              className={cn(
                'list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none grid items-center gap-4 px-3 py-2 transition-colors hover:bg-[#0d1218]',
                gridColsClass,
              )}
            >
              {cells}
            </summary>
            <div className="sites-table-expanded">
              <SiteDetailsBody site={row} />
            </div>
          </details>
        </UrlSync>
      )}
    />
  );
}

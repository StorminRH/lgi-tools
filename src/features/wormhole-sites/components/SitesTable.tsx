import { Pill } from '@/components/ui/pill';
import { SortableTable, type SortableColumn } from '@/components/ui/sortable-table';
import { UrlSync } from '@/components/ui/url-sync';
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
    width: '2.4fr',
    render: (s) => <span className="truncate text-name">{s.name}</span>,
  },
  {
    key: 'type',
    label: 'Type',
    width: '0.9fr',
    render: (s) => (
      <Pill tone={SITE_TYPE_TONE[s.siteType]} size="sm">
        {SITE_TYPE_LABEL[s.siteType]}
      </Pill>
    ),
  },
  {
    key: 'isk',
    label: 'ISK',
    width: '0.7fr',
    align: 'right',
    render: (s) => <span className="tabular-nums">{formatIskShort(primaryIskFor(s))}</span>,
  },
  {
    key: 'blueLoot',
    label: 'Blue loot',
    width: '0.8fr',
    align: 'right',
    render: (s) => <span className="tabular-nums text-muted">{formatIskShort(s.blueLootIsk)}</span>,
  },
  {
    key: 'scrams',
    label: 'Scrams',
    width: '0.6fr',
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
    width: '0.6fr',
    render: (s) =>
      s.wormholeClass ? (
        <Pill tone={CLASS_TONE[s.wormholeClass]} size="sm">{s.wormholeClass}</Pill>
      ) : (
        <span className="text-muted">—</span>
      ),
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
      sortKey={sortKey}
      sortDir={sortDir}
      basePath="/sites"
      currentParams={currentParams}
      defaultDirFor={(k) => defaultDirFor(k as SortableKey)}
      getRowKey={(s) => s.id}
      emptyState="No sites match this filter combination."
      renderRow={({ row, cells, key, gridTemplate }) => (
        <UrlSync key={key} basePath="/sites" entityId={row.id}>
          <details className="sites-table-row border-b border-border-soft last:border-b-0">
            <summary
              className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none grid items-center gap-3 px-3 py-2 transition-colors hover:bg-[#0d1218]"
              style={{ gridTemplateColumns: gridTemplate }}
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

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterOption } from '@/components/ui/filter-bar';
import { UrlSync } from '@/components/ui/url-sync';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { SitesTable } from '@/features/wormhole-sites/components/SitesTable';
import { SitesTerminalSearch } from '@/features/wormhole-sites/components/SitesTerminalSearch';
import {
  CLASS_TONE,
  SITE_TYPE_LABEL,
  SITE_TYPE_TONE,
} from '@/features/wormhole-sites/components/wormhole-styles';
import { overlayLivePrices } from '@/features/wormhole-sites/live-prices';
import { listSiteDetails } from '@/features/wormhole-sites/queries';
import { SITE_TYPES, WORMHOLE_CLASSES } from '@/features/wormhole-sites/schema';
import { parseSortDir, parseSortKey } from '@/features/wormhole-sites/sort';
import type { SiteDetail, SiteType, WormholeClass } from '@/features/wormhole-sites/types';

export const metadata: Metadata = {
  title: 'Wormhole Sites — Live Jita Loot & Resource Values',
  description:
    'All 69 Eve Online wormhole sites — combat, ore, gas, relic, and data — filterable by class and type, with live Jita prices on ore and gas resources and full NPC wave breakdowns.',
  alternates: { canonical: '/sites' },
};

const SECTION_ORDER: SiteType[] = ['combat', 'ore', 'gas', 'relic', 'data'];

const TYPE_OPTIONS: FilterOption[] = [
  { value: null, label: 'All' },
  ...SITE_TYPES.map(
    (t): FilterOption => ({ value: t, label: SITE_TYPE_LABEL[t], tone: SITE_TYPE_TONE[t] }),
  ),
];

const CLASS_OPTIONS: FilterOption[] = [
  { value: null, label: 'All' },
  ...WORMHOLE_CLASSES.map(
    (c): FilterOption => ({ value: c, label: c, tone: CLASS_TONE[c] }),
  ),
];

const VIEW_OPTIONS: FilterOption[] = [
  { value: null, label: 'Cards' },
  { value: 'table', label: 'Table', tone: 'blue' },
];

function groupBySection(sites: SiteDetail[]): Record<SiteType, SiteDetail[]> {
  const groups: Record<SiteType, SiteDetail[]> = {
    combat: [], ore: [], gas: [], relic: [], data: [],
  };
  for (const s of sites) groups[s.siteType].push(s);
  return groups;
}

async function SitesContent({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; class?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const raw = await searchParams;

  const type: SiteType | undefined =
    raw.type && (SITE_TYPES as readonly string[]).includes(raw.type)
      ? (raw.type as SiteType)
      : undefined;

  const wormholeClass: WormholeClass | undefined =
    raw.class && (WORMHOLE_CLASSES as readonly string[]).includes(raw.class)
      ? (raw.class as WormholeClass)
      : undefined;

  const isTableView = raw.view === 'table';
  const sortKey = parseSortKey(raw.sort);
  const sortDir = parseSortDir(raw.dir);

  const rawSites = await listSiteDetails({ type, wormholeClass });
  const sites = await overlayLivePrices(rawSites);
  const groups = groupBySection(sites);

  // Threaded through every FilterBar so toggling any filter preserves the
  // others (Type/Class/View/sort all survive each other).
  const currentParams: Record<string, string | undefined> = {
    type,
    class: wormholeClass,
    view: isTableView ? 'table' : undefined,
    sort: sortKey ?? undefined,
    dir: sortKey ? sortDir : undefined,
  };

  return (
    <>
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <h1 className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Wormhole Sites
        </h1>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          {sites.length} site{sites.length === 1 ? '' : 's'}
          {type ? ` · ${SITE_TYPE_LABEL[type]}` : ''}
          {wormholeClass ? ` · ${wormholeClass}` : ''}
        </div>
      </header>

      <div className="w-full max-w-[1100px] mb-4">
        <SitesTerminalSearch />
      </div>

      <div className="w-full max-w-[1100px] flex flex-col gap-2.5 mb-8">
        <FilterBar
          label="View"
          paramName="view"
          options={VIEW_OPTIONS}
          activeValue={isTableView ? 'table' : null}
          basePath="/sites"
          currentParams={currentParams}
        />
        <FilterBar
          label="Type"
          paramName="type"
          options={TYPE_OPTIONS}
          activeValue={type ?? null}
          basePath="/sites"
          currentParams={currentParams}
        />
        <FilterBar
          label="Class"
          paramName="class"
          options={CLASS_OPTIONS}
          activeValue={wormholeClass ?? null}
          basePath="/sites"
          currentParams={currentParams}
        />
      </div>

      {sites.length === 0 ? (
        <div className="w-full max-w-[1100px]">
          <EmptyState>No sites match this filter combination.</EmptyState>
        </div>
      ) : isTableView ? (
        <div className="w-full max-w-[1100px]">
          <SitesTable
            sites={sites}
            sortKey={sortKey}
            sortDir={sortDir}
            currentParams={currentParams}
          />
        </div>
      ) : (
        SECTION_ORDER.map((sectionType, i) => {
          const sectionSites = groups[sectionType];
          if (sectionSites.length === 0) return null;
          return (
            <section key={sectionType} className="w-full max-w-[1100px]">
              <div className={`w-full flex items-center gap-3.5 ${i === 0 ? 'mt-0' : 'mt-12'} mb-5`}>
                <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted whitespace-nowrap">
                  {SITE_TYPE_LABEL[sectionType]} Sites
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="sites-grid">
                {sectionSites.map((site) => (
                  <UrlSync key={site.id} basePath="/sites" entityId={site.id}>
                    <SiteCard site={site} />
                  </UrlSync>
                ))}
              </div>
            </section>
          );
        })
      )}

    </>
  );
}

function SitesLoading() {
  return (
    <div className="w-full max-w-[1100px] text-[10px] tracking-[0.12em] uppercase text-muted">
      Loading sites…
    </div>
  );
}

// Static page chrome (background + padding) prerenders; the searchParams-driven
// list, filters, and live-price overlay stream from the dynamic hole.
export default function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; class?: string; view?: string; sort?: string; dir?: string }>;
}) {
  return (
    <div className="sites-page-bg flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <Suspense fallback={<SitesLoading />}>
        <SitesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

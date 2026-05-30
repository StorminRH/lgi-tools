import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
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

type SitesSearchParams = {
  type?: string;
  class?: string;
  view?: string;
  sort?: string;
  dir?: string;
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

async function parseSitesParams(searchParams: Promise<SitesSearchParams>) {
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

  // Threaded through every FilterBar so toggling any filter preserves the
  // others (Type/Class/View/sort all survive each other).
  const currentParams: Record<string, string | undefined> = {
    type,
    class: wormholeClass,
    view: isTableView ? 'table' : undefined,
    sort: sortKey ?? undefined,
    dir: sortKey ? sortDir : undefined,
  };

  return { type, wormholeClass, isTableView, sortKey, sortDir, currentParams };
}

// Per-request memo so the header count and the site list share ONE
// listSiteDetails + overlayLivePrices pass even though they render in separate
// <Suspense> holes. searchParams is read here — inside the loader, which only
// runs from the Suspense children — never in the page body, so the shell stays
// static.
const loadSites = cache(
  async (searchParams: Promise<SitesSearchParams>): Promise<SiteDetail[]> => {
    const { type, wormholeClass } = await parseSitesParams(searchParams);
    const rawSites = await listSiteDetails({ type, wormholeClass });
    return overlayLivePrices(rawSites);
  },
);

// Header subtitle — the site count plus the active filter labels. Streams once
// the priced data resolves; the static title above it paints immediately.
async function SitesSummaryLine({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
  const [sites, { type, wormholeClass }] = await Promise.all([
    loadSites(searchParams),
    parseSitesParams(searchParams),
  ]);

  return (
    <>
      {sites.length} site{sites.length === 1 ? '' : 's'}
      {type ? ` · ${SITE_TYPE_LABEL[type]}` : ''}
      {wormholeClass ? ` · ${wormholeClass}` : ''}
    </>
  );
}

function SitesFilterBars({
  type,
  wormholeClass,
  isTableView,
  currentParams,
}: {
  type: SiteType | null;
  wormholeClass: WormholeClass | null;
  isTableView: boolean;
  currentParams: Record<string, string | undefined>;
}) {
  return (
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
        activeValue={type}
        basePath="/sites"
        currentParams={currentParams}
      />
      <FilterBar
        label="Class"
        paramName="class"
        options={CLASS_OPTIONS}
        activeValue={wormholeClass}
        basePath="/sites"
        currentParams={currentParams}
      />
    </div>
  );
}

// Interactive chrome — terminal search + filter bars. Depends only on
// searchParams (no DB/price read), so it paints near-instantly and never waits
// on the slow data fetch.
async function SitesChrome({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
  const { type, wormholeClass, isTableView, currentParams } =
    await parseSitesParams(searchParams);

  return (
    <>
      <div className="w-full max-w-[1100px] mb-4">
        <SitesTerminalSearch />
      </div>
      <SitesFilterBars
        type={type ?? null}
        wormholeClass={wormholeClass ?? null}
        isTableView={isTableView}
        currentParams={currentParams}
      />
    </>
  );
}

async function SitesList({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
  const [sites, { isTableView, sortKey, sortDir, currentParams }] = await Promise.all([
    loadSites(searchParams),
    parseSitesParams(searchParams),
  ]);

  if (sites.length === 0) {
    return (
      <div className="w-full max-w-[1100px]">
        <EmptyState>No sites match this filter combination.</EmptyState>
      </div>
    );
  }

  if (isTableView) {
    return (
      <div className="w-full max-w-[1100px]">
        <SitesTable
          sites={sites}
          sortKey={sortKey}
          sortDir={sortDir}
          currentParams={currentParams}
        />
      </div>
    );
  }

  const groups = groupBySection(sites);

  return (
    <>
      {SECTION_ORDER.map((sectionType, i) => {
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
      })}
    </>
  );
}

// Mirrors the chrome's layout so the filter rows hold their space while the
// real (active-state) bars stream in — only the search box is a placeholder.
function SitesChromeFallback() {
  return (
    <>
      <div className="w-full max-w-[1100px] mb-4">
        <div className="w-full px-3 py-2 border border-border bg-bg text-[12px]">
          &nbsp;
        </div>
      </div>
      <SitesFilterBars
        type={null}
        wormholeClass={null}
        isTableView={false}
        currentParams={{}}
      />
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

// The static shell — background, padding, page title, and the chrome/list
// fallbacks — prerenders. searchParams is read only inside the <Suspense>
// children below, so each request-time region streams into its own hole: the
// title paints immediately, the search + filter bars stream as soon as the URL
// is parsed, and the site count + list stream once the priced data resolves.
export default function SitesPage({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
  return (
    <div className="sites-page-bg flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <h1 className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Wormhole Sites
        </h1>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          <Suspense fallback={<>&nbsp;</>}>
            <SitesSummaryLine searchParams={searchParams} />
          </Suspense>
        </div>
      </header>

      <Suspense fallback={<SitesChromeFallback />}>
        <SitesChrome searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<SitesLoading />}>
        <SitesList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

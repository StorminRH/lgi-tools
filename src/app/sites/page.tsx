import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import { UrlSync } from '@/components/ui/url-sync';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import {
  SitesFilterLayout,
  type SiteCardItem,
} from '@/features/wormhole-sites/components/SitesFilterLayout';
import { SitesTable } from '@/features/wormhole-sites/components/SitesTable';
import { overlayLivePrices } from '@/features/wormhole-sites/live-prices';
import { listSiteDetails } from '@/features/wormhole-sites/queries';
import { siteClassSet } from '@/features/wormhole-sites/site-filter';
import { parseSortDir, parseSortKey } from '@/features/wormhole-sites/sort';
import type { SiteDetail } from '@/features/wormhole-sites/types';

export const metadata: Metadata = {
  title: 'Wormhole Sites — Live Jita Loot & Resource Values',
  description:
    'All 69 Eve Online wormhole sites — combat, ore, gas, relic, and data — filterable by class and type, with live Jita prices on ore and gas resources and full NPC wave breakdowns.',
  alternates: { canonical: '/sites' },
};

// Only the table's sort survives in the URL; the Class/Type filters and the
// Cards/Table toggle are client-side state (SitesFilterLayout).
type SitesSearchParams = {
  sort?: string;
  dir?: string;
};

// Per-request memo for the whole priced catalogue. Filtering moved client-side,
// so the server loads ALL sites once (no type/class searchParams) and overlays
// live prices in a single pass shared by the cards and the table.
const loadAllSites = cache(async (): Promise<SiteDetail[]> => {
  const rawSites = await listSiteDetails({});
  return overlayLivePrices(rawSites);
});

// Request-time region: reads the table sort from the URL, loads the priced
// catalogue, and builds the server-rendered card + table nodes for the client
// filter layout. Streams into the static shell's <Suspense> hole.
async function SitesContent({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
  const raw = await searchParams;
  const sortKey = parseSortKey(raw.sort);
  const sortDir = parseSortDir(raw.dir);
  const sites = await loadAllSites();

  const cards: SiteCardItem[] = sites.map((site) => ({
    meta: { id: site.id, type: site.siteType, clsSet: siteClassSet(site) },
    node: (
      <UrlSync key={site.id} basePath="/sites" entityId={site.id}>
        <SiteCard site={site} />
      </UrlSync>
    ),
  }));

  const table = (
    <SitesTable
      sites={sites}
      sortKey={sortKey}
      sortDir={sortDir}
      currentParams={{ sort: sortKey ?? undefined, dir: sortKey ? sortDir : undefined }}
    />
  );

  return <SitesFilterLayout cards={cards} table={table} total={sites.length} />;
}

function SitesLoading() {
  return (
    <div className="w-full max-w-[1080px] mx-auto px-7 pt-[34px] text-[10px] tracking-[0.12em] uppercase text-muted">
      Loading sites…
    </div>
  );
}

// The static shell — just the page background. The header, filter rail, and
// results all stream in from the <Suspense> hole once the priced catalogue
// resolves; the rail + view toggle are then client-interactive.
export default function SitesPage({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
  return (
    <div className="sites-page-bg w-full">
      <Suspense fallback={<SitesLoading />}>
        <SitesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

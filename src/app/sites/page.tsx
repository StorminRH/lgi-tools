import { Suspense } from 'react';
import { Banner } from '@/components/ui/banner';
import { PageShell } from '@/components/ui/page-shell';
import { UrlSync } from '@/components/ui/url-sync';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import {
  SitesFilterLayout,
  type SiteCardItem,
} from '@/features/wormhole-sites/components/SitesFilterLayout';
import { SitesTable } from '@/features/wormhole-sites/components/SitesTable';
import { SitesTableFromUrl } from '@/features/wormhole-sites/components/SitesTableFromUrl';
import { selectDevSampleSites } from '@/features/wormhole-sites/dev-sample';
import { listPricedSiteDetails } from '@/features/wormhole-sites/queries';
import { siteClassSet } from '@/features/wormhole-sites/site-filter';
import { buildPageMetadata } from '@/lib/page-metadata';

/** Static search and social metadata for the /sites route. */
export const metadata = buildPageMetadata({
  title: 'Wormhole Sites — Live Jita Loot & Resource Values',
  description:
    'Eve Online wormhole sites — combat, ore, gas, relic, and data — filterable by class and type, with live Jita prices on ore and gas resources and full NPC wave breakdowns.',
  canonical: '/sites',
});

function DevSampleBanner({
  sampled,
  shown,
  total,
}: {
  sampled: boolean;
  shown: number;
  total: number;
}) {
  if (!sampled) return null;
  return (
    <div data-dev-sample={`${shown}/${total}`} className="mb-4">
      <Banner tone="warn">
        DEV SAMPLE MODE — showing {shown} of {total} sites
        {' '}
        (LGI_SITES_SAMPLE=1)
      </Banner>
    </div>
  );
}

// Cached shell region: catalogue structure and the hourly price seed are shared,
// so the page head, filter rail, cards, and default table all prerender. Only the
// table's URL sort is a request-time leaf; the view preference reconciles through
// PreferencesProvider after hydration without withholding the meaningful shell.
async function SitesCatalogue() {
  const allSites = await listPricedSiteDetails();
  const sample = selectDevSampleSites(allSites);
  const sites = sample ?? allSites;
  const fullCount = allSites.length;
  const sampled = sample !== null;

  const cards: SiteCardItem[] = sites.map((site) => ({
    meta: { id: site.id, type: site.siteType, clsSet: siteClassSet(site) },
    node: (
      <UrlSync key={site.id} basePath="/sites" entityId={site.id}>
        <SiteCard site={site} />
      </UrlSync>
    ),
  }));

  const table = (
    <Suspense
      fallback={
        <SitesTable
          sites={sites}
          sortKey={null}
          sortDir="desc"
          currentParams={{}}
        />
      }
    >
      <SitesTableFromUrl sites={sites} />
    </Suspense>
  );

  return (
    <>
      <DevSampleBanner sampled={sampled} shown={sites.length} total={fullCount} />
      <SitesFilterLayout
        cards={cards}
        table={table}
        total={sites.length}
        initialView="cards"
      />
    </>
  );
}

/**
 * The cached shell carries the catalogue and its filter chrome; only URL-backed sorting is a
 * request-time leaf inside the table.
 */
export default function SitesPage() {
  return (
    <PageShell mode="workspace">
      <SitesCatalogue />
    </PageShell>
  );
}

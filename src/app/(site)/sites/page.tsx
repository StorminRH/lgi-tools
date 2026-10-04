import { Suspense } from 'react';
import { Banner } from '@/components/ui/banner';
import { PageShell } from '@/components/ui/page-shell';
import { UrlSync } from '@/components/ui/url-sync';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import {
  SitesFilterLayout,
  SitesResults,
  SitesViewTools,
  type SiteCardItem,
} from '@/features/wormhole-sites/components/SitesFilterLayout';
import { SitesTable } from '@/features/wormhole-sites/components/SitesTable';
import {
  SitesTableFromUrl,
  type SitesSearchParams,
} from '@/features/wormhole-sites/components/SitesTableFromUrl';
import { selectDevSampleSites } from '@/features/wormhole-sites/dev-sample';
import { listPricedSiteDetails } from '@/features/wormhole-sites/queries';
import { siteClassSet } from '@/features/wormhole-sites/site-filter';
import { buildPageMetadata } from '@/lib/page-metadata';

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

async function SitesCatalogue({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
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

  // The sort comes from the URL; until it resolves, the same sites stand in
  // unsorted, so the table is real rows from the first paint.
  const table = (
    <Suspense fallback={<SitesTable sites={sites} sortKey={null} sortDir="desc" currentParams={{}} />}>
      <SitesTableFromUrl sites={sites} searchParams={searchParams} />
    </Suspense>
  );

  return (
    <>
      <DevSampleBanner sampled={sampled} shown={sites.length} total={fullCount} />
      {/* Cards or table is an account setting read in the browser, so the
          prerendered page carries every site instead of waiting on a cookie. */}
      <SitesFilterLayout sites={cards.map((card) => card.meta)} total={sites.length} tools={<SitesViewTools />}>
        <SitesResults cards={cards} table={table} />
      </SitesFilterLayout>
    </>
  );
}

export default function SitesPage({
  searchParams,
}: {
  searchParams: Promise<SitesSearchParams>;
}) {
  return (
    <PageShell mode="workspace">
      <SitesCatalogue searchParams={searchParams} />
    </PageShell>
  );
}

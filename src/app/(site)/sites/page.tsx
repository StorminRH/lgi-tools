import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { Banner } from '@/components/ui/banner';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { UrlSync } from '@/components/ui/url-sync';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import {
  SitesFilterLayout,
  SitesResults,
  type SiteCardItem,
} from '@/features/wormhole-sites/components/SitesFilterLayout';
import {
  SitesTableFromUrl,
  type SitesSearchParams,
} from '@/features/wormhole-sites/components/SitesTableFromUrl';
import { selectDevSampleSites } from '@/features/wormhole-sites/dev-sample';
import { listPricedSiteDetails } from '@/features/wormhole-sites/queries';
import { siteClassSet } from '@/features/wormhole-sites/site-filter';
import { buildPageMetadata } from '@/lib/page-metadata';
import { cookieNameFor, readPreferenceCookieValue, sitesView } from '@/lib/preferences';

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

async function SitesResultsFromCookie({
  cards,
  table,
}: {
  cards: SiteCardItem[];
  table: React.ReactNode;
}) {
  const initialView = readPreferenceCookieValue(
    (await cookies()).get(cookieNameFor(sitesView))?.value,
    sitesView,
  );
  return <SitesResults cards={cards} table={table} initialView={initialView} />;
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

  const table = (
    <Suspense
      fallback={
        <Skeleton
          label="Loading sorted sites"
          className="h-[640px] w-full rounded-card"
        />
      }
    >
      <SitesTableFromUrl sites={sites} searchParams={searchParams} />
    </Suspense>

  );
  const fallback = (
    <div className="pt-[34px]">
      <Skeleton
        label="Loading saved sites view"
        className="h-[720px] w-full rounded-card"
      />
    </div>

  );

  return (
    <>
      <DevSampleBanner sampled={sampled} shown={sites.length} total={fullCount} />
      <SitesFilterLayout sites={cards.map((card) => card.meta)} total={sites.length}>
        <Suspense fallback={fallback}>
          <SitesResultsFromCookie cards={cards} table={table} />
        </Suspense>

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

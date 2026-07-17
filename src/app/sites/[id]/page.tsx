import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { JsonLd } from '@/components/JsonLd';
import { PageShell } from '@/components/ui/page-shell';
import { getCachedPricesFreshness } from '@/data/market-prices/cache';
import { SITE_URL } from '@/config/site-url';
import { loadNumericRouteEntity, parseNumericRouteId } from '@/lib/route-id';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { SiteMetaStrip } from '@/features/wormhole-sites/components/SiteMetaStrip';
import { RelatedSites } from '@/features/wormhole-sites/components/RelatedSites';
import {
  getPricedSiteDetail,
  getSiteSearchIndex,
} from '@/features/wormhole-sites/queries';
import { deriveSiteMeta } from '@/features/wormhole-sites/site-meta';
import { selectRelatedSites } from '@/features/wormhole-sites/related-sites';
import { buildBreadcrumbList } from '@/lib/structured-data';

// generateMetadata and the page body both need the priced site; React cache()
// collapses them to one lookup per request (the underlying read is already
// 'use cache'-backed, so this only dedupes within the render pass).
const loadSite = cache(getPricedSiteDetail);

/**
 * Prerender a static shell for all 69 catalogue sites (the catalogue is
 * deploy-static); the build ID invalidates them on deploy.
 */
export async function generateStaticParams(): Promise<{ id: string }[]> {
  const sites = await getSiteSearchIndex();
  return sites.map((s) => ({ id: String(s.id) }));
}

/**
 * Builds request-independent metadata for /sites/[id] from the route parameter and canonical
 * content source.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  // Use the priced read (same hourly-tagged cache the page body uses) so the
  // ISK in the description matches the page and its "live Jita prices" claim,
  // rather than freezing at the deploy-time structural snapshot.
  const result = await loadNumericRouteEntity(params, loadSite);
  if (!result) notFound();
  const { id, entity: site } = result;

  const { title, description } = deriveSiteMeta(site);
  const canonicalUrl = `${SITE_URL}/sites/${id}`;

  return {
    title,
    description,
    alternates: { canonical: `/sites/${id}` },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// Presentational view shared by the streamed deep-link meta and its fallback, so
// the layout (back link + price-freshness strip) is identical the moment the
// shell paints and when the request-time values stream in.
function DeepLinkMetaView({
  backHref,
  source,
  lastPriceUpdate,
}: {
  backHref: string;
  source: string;
  lastPriceUpdate: Date | null;
}) {
  return (
    <>
      <div className="w-full mb-4">
        <Link
          href={backHref}
          className="text-label tracking-[0.12em] uppercase text-muted"
        >
          ← Return to full list
        </Link>
      </div>
      <div className="w-full mb-4">
        <SiteMetaStrip source={source} lastPriceUpdate={lastPriceUpdate} />
      </div>
    </>
  );
}

// The only request-time reads on the page: the back link mirrors the filter
// params you arrived with, and the freshness strip's "Xm ago" is computed at
// request time. Isolated in a Suspense hole so the site content prerenders.
async function SiteDeepLinkMeta({
  source,
  searchParams,
}: {
  source: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { lastUpdatedAt } = await getCachedPricesFreshness();

  // Forward any active filter params so the back link returns to the same
  // filtered view the user was on before sharing.
  const qs = new URLSearchParams();
  if (typeof sp.type === 'string') qs.set('type', sp.type);
  if (typeof sp.class === 'string') qs.set('class', sp.class);
  const backHref = qs.toString() ? `/sites?${qs}` : '/sites';

  return (
    <DeepLinkMetaView backHref={backHref} source={source} lastPriceUpdate={lastUpdatedAt} />
  );
}

/**
 * The site content (name, resources, waves, prices) prerenders into the static
 * shell so crawlers see it in the initial HTML; live prices ride the cached
 * `getPricedSiteDetail` (refreshed hourly by the prices cron via its tag). Only
 * the back link + freshness strip read request-time data, from the Suspense hole.
 */
export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;
  // Require a bare digit string (see generateMetadata) — reject "12abc" → 404.
  const id = parseNumericRouteId(rawId);
  if (id === null) notFound();

  const site = await loadSite(id);
  if (!site) notFound();
  const relatedSites = selectRelatedSites(await getSiteSearchIndex(), id);

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Wormhole Sites', url: `${SITE_URL}/sites` },
    { name: site.name, url: `${SITE_URL}/sites/${id}` },
  ]);

  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20 gap-0">
        <JsonLd data={breadcrumbJsonLd} />
        {/* Entity-detail pages self-title: they open content-first (no visible
            PageHead), so the page title lives in this sr-only <h1> for a11y/SEO.
            PageHead is the list/section header; the detail is its own surface. */}
        <h1 className="sr-only">{site.name}</h1>
        <Suspense
          fallback={
            <DeepLinkMetaView backHref="/sites" source={site.sourceTab} lastPriceUpdate={null} />
          }
        >
          <SiteDeepLinkMeta source={site.sourceTab} searchParams={searchParams} />
        </Suspense>
        <div className="w-full">
          <SiteCard site={site} defaultOpen />
          <RelatedSites sites={relatedSites} />
        </div>
      </div>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { JsonLd } from '@/components/JsonLd';
import { PageShell } from '@/components/ui/page-shell';
import { getCachedPricesFreshness } from '@/data/market-prices/cache';
import { SITE_URL } from '@/config/site-url';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { SiteMetaStrip } from '@/features/wormhole-sites/components/SiteMetaStrip';
import {
  getPricedSiteDetail,
  getSiteSearchIndex,
} from '@/features/wormhole-sites/queries';
import type { SiteDetail } from '@/features/wormhole-sites/types';

// generateMetadata and the page body both need the priced site; React cache()
// collapses them to one lookup per request (the underlying read is already
// 'use cache'-backed, so this only dedupes within the render pass).
const loadSite = cache(getPricedSiteDetail);

const SITE_TYPE_LABEL: Record<string, string> = {
  combat: 'Combat',
  ore: 'Ore',
  gas: 'Gas',
  relic: 'Relic',
  data: 'Data',
};

function formatIsk(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B ISK`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M ISK`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K ISK`;
  return `${value} ISK`;
}

// Unique, descriptive meta description per site — built from the site's own data
// so no two of the 69 pages share a generic snippet. Resource sites lead with
// their harvestables and live value; wave-driven sites lead with loot + waves.
function buildSiteDescription(
  site: SiteDetail,
  typeLabel: string,
  classLabel: string | null,
): string {
  const kind = `${classLabel ? `${classLabel} ` : ''}${typeLabel.toLowerCase()} site`;
  const isWaveDriven =
    site.siteType === 'combat' || site.siteType === 'relic' || site.siteType === 'data';

  if (isWaveDriven) {
    const loot = site.blueLootIsk ?? 0;
    const lootText =
      loot > 0 ? `${formatIsk(loot)} estimated blue-loot value` : 'sleeper loot';
    const waves = site.waves.length;
    const waveText = waves > 0 ? `, ${waves} NPC wave${waves === 1 ? '' : 's'}` : '';
    return `${site.name} is a ${kind} in Eve Online wormhole space — ${lootText}${waveText}, with full NPC and EWAR stats.`;
  }

  const names = site.resources.slice(0, 3).map((r) => r.resourceName);
  const resourceText = names.length > 0 ? names.join(', ') : 'its resources';
  const total = site.resourceValueIsk ?? 0;
  const totalText = total > 0 ? ` — ${formatIsk(total)} at live Jita prices` : '';
  return `${site.name} is a ${kind} in Eve Online wormhole space. Live Jita prices on ${resourceText}${totalText}, updated hourly.`;
}

// Prerender a static shell for all 69 catalogue sites (the catalogue is
// deploy-static); the build ID invalidates them on deploy.
export async function generateStaticParams(): Promise<{ id: string }[]> {
  const sites = await getSiteSearchIndex();
  return sites.map((s) => ({ id: String(s.id) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  // Require a bare digit string — Number.parseInt would otherwise accept
  // "12abc" as 12 and resolve the wrong entity instead of 404-ing.
  if (!/^\d+$/.test(rawId)) return {};
  const id = Number.parseInt(rawId, 10);

  // Use the priced read (same hourly-tagged cache the page body uses) so the
  // ISK in the description matches the page and its "live Jita prices" claim,
  // rather than freezing at the deploy-time structural snapshot.
  const site = await loadSite(id);
  if (!site) return {};

  const typeLabel = SITE_TYPE_LABEL[site.siteType] ?? site.siteType;
  const classLabel = site.wormholeClass ?? (site.siteType === 'gas' ? 'Wormhole' : null);
  const title = [site.name, classLabel ? `${classLabel} ${typeLabel}` : typeLabel]
    .filter(Boolean)
    .join(' — ');

  const description = buildSiteDescription(site, typeLabel, classLabel);
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
      images: ['/logo.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/logo.png'],
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
          className="text-[10px] tracking-[0.12em] uppercase text-muted"
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

// The site content (name, resources, waves, prices) prerenders into the static
// shell so crawlers see it in the initial HTML; live prices ride the cached
// `getPricedSiteDetail` (refreshed hourly by the prices cron via its tag). Only
// the back link + freshness strip read request-time data, from the Suspense hole.
export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;
  // Require a bare digit string (see generateMetadata) — reject "12abc" → 404.
  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number.parseInt(rawId, 10);

  const site = await loadSite(id);
  if (!site) notFound();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Wormhole Sites', item: `${SITE_URL}/sites` },
      { '@type': 'ListItem', position: 3, name: site.name, item: `${SITE_URL}/sites/${id}` },
    ],
  };

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
        </div>
      </div>
    </PageShell>
  );
}

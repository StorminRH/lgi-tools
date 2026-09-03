import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { JsonLd } from '@/components/composition/JsonLd';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { getCachedPricesFreshness } from '@/data/market-prices/cache';
import { SITE_URL } from '@/config/site-url';
import { loadNumericRouteEntity, parseNumericRouteId } from '@/transport/route-id';
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

const loadSite = cache(getPricedSiteDetail);

export async function generateStaticParams(): Promise<{ id: string }[]> {
  const sites = await getSiteSearchIndex();
  return sites.map((s) => ({ id: String(s.id) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {

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

async function SiteDeepLinkMeta({
  source,
  searchParams,
}: {
  source: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { lastUpdatedAt } = await getCachedPricesFreshness();

  const qs = new URLSearchParams();
  if (typeof sp.type === 'string') qs.set('type', sp.type);
  if (typeof sp.class === 'string') qs.set('class', sp.class);
  const backHref = qs.toString() ? `/sites?${qs}` : '/sites';

  return (
    <DeepLinkMetaView
      backHref={backHref}
      source={source}
      lastPriceUpdate={lastUpdatedAt}
    />
  );
}

function SiteDetailFallback() {
  return (
    <div className="flex w-full flex-col items-center gap-4 pb-20">
      <Skeleton label="Loading site" className="h-4 w-40 self-start" />
      <Skeleton aria-hidden="true" className="h-10 w-full max-w-[32rem]" />
      <Skeleton aria-hidden="true" className="h-64 w-full max-w-[32rem]" />
    </div>

  );
}

export async function SiteDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;

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
    <>
      <JsonLd data={breadcrumbJsonLd} />
      {}
      <h1 className="sr-only">{site.name}</h1>

      <Suspense
        fallback={
          <DeepLinkMetaView
            backHref="/sites"
            source={site.sourceTab}
            lastPriceUpdate={null}
          />
        }
      >
        <SiteDeepLinkMeta source={site.sourceTab} searchParams={searchParams} />
      </Suspense>

      <div className="w-full">
        {}
        <div className="mx-auto w-full max-w-[32rem]">
          <SiteCard site={site} presentation="standalone" />
        </div>

        <RelatedSites sites={relatedSites} />
      </div>

    </>

  );
}

export default function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PageShell mode="detail">
      <div className="flex flex-col items-center pb-20 gap-0">
        <Suspense fallback={<SiteDetailFallback />}>
          <SiteDetailContent params={params} searchParams={searchParams} />
        </Suspense>

      </div>

    </PageShell>

  );
}

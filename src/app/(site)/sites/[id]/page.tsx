import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { JsonLd } from '@/components/composition/JsonLd';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { getCachedPricesFreshness } from '@/data/market-prices/cache';
import { loadNumericRouteEntity } from '@/transport/route-id';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { SiteMetaStrip } from '@/features/wormhole-sites/components/SiteMetaStrip';
import { RelatedSites } from '@/features/wormhole-sites/components/RelatedSites';
import {
  getPricedSiteDetail,
  getSiteSearchIndex,
} from '@/features/wormhole-sites/queries';
import { deriveSiteMeta } from '@/features/wormhole-sites/site-meta';
import { selectRelatedSites } from '@/features/wormhole-sites/related-sites';
import { buildPageMetadata } from '@/lib/page-metadata';
import { withSearchParams } from '@/lib/search-params';
import { buildBreadcrumbList } from '@/lib/structured-data';

export async function generateStaticParams(): Promise<{ id: string }[]> {
  const sites = await getSiteSearchIndex();
  return sites.map((s) => ({ id: String(s.id) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const result = await loadNumericRouteEntity(params, getPricedSiteDetail);
  if (!result) notFound();
  const { id, entity: site } = result;

  const { title, description } = deriveSiteMeta(site);
  return buildPageMetadata({ title, description, canonical: `/sites/${id}`, socialImage: 'route' });
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
          className="text-label tracking-wide uppercase text-muted"
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

  const backHref = withSearchParams('/sites', '', {
    type: typeof sp.type === 'string' ? sp.type : null,
    class: typeof sp.class === 'string' ? sp.class : null,
  });

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
    <SkeletonGroup label="Loading site" className="flex w-full flex-col items-center gap-4 pb-20">
      <Skeleton className="h-4 w-40 self-start" />
      <Skeleton className="h-10 w-full max-w-[32rem]" />
      <Skeleton className="h-64 w-full max-w-[32rem] rounded-card" />
    </SkeletonGroup>
  );
}

export async function SiteDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await loadNumericRouteEntity(params, getPricedSiteDetail);
  if (!result) notFound();
  const { id, entity: site } = result;
  const relatedSites = selectRelatedSites(await getSiteSearchIndex(), id);

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: 'Wormhole Sites', path: '/sites' },
    { name: site.name, path: `/sites/${id}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
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

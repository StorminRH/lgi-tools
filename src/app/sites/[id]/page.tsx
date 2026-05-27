import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPricesFreshness } from '@/data/market-prices/cache';
import { db } from '@/db';
import { SITE_URL } from '@/config/site-url';
import { SiteCard } from '@/features/wormhole-sites/components/SiteCard';
import { SiteMetaStrip } from '@/features/wormhole-sites/components/SiteMetaStrip';
import { overlayLivePrices } from '@/features/wormhole-sites/live-prices';
import { getSiteDetail } from '@/features/wormhole-sites/queries';

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) return {};

  const site = await getSiteDetail(id);
  if (!site) return {};

  const typeLabel = SITE_TYPE_LABEL[site.siteType] ?? site.siteType;
  const classLabel = site.wormholeClass ?? (site.siteType === 'gas' ? 'Wormhole' : null);
  const titlePieces = [site.name, classLabel ? `${classLabel} ${typeLabel}` : typeLabel];
  const title = titlePieces.filter(Boolean).join(' — ');

  const iskTotal = (site.blueLootIsk ?? 0) + (site.resourceValueIsk ?? 0);
  const description =
    iskTotal > 0
      ? `${formatIsk(iskTotal)} total value.`
      : `Wormhole site detail on LGI.tools.`;

  const canonicalUrl = `${SITE_URL}/sites/${id}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();

  const raw = await getSiteDetail(id);
  if (!raw) notFound();

  const [site] = await overlayLivePrices([raw]);
  const { lastUpdatedAt } = await getPricesFreshness(db);

  // Forward any active filter params so the back link returns to
  // the same filtered view the user was on before sharing.
  const qs = new URLSearchParams();
  if (typeof sp.type === 'string') qs.set('type', sp.type);
  if (typeof sp.class === 'string') qs.set('class', sp.class);
  const backHref = qs.toString() ? `/sites?${qs}` : '/sites';

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <div className="w-full max-w-[1400px] mb-4">
        <Link
          href={backHref}
          className="text-[10px] tracking-[0.12em] uppercase text-muted"
        >
          ← Return to full list
        </Link>
      </div>
      <div className="w-full max-w-[1400px] mb-4">
        <SiteMetaStrip
          source={site.sourceTab}
          lastPriceUpdate={lastUpdatedAt}
        />
      </div>
      <div className="w-full max-w-[1400px]">
        <SiteCard site={site} defaultOpen />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SITE_URL } from '@/config/site-url';
import { BlueprintHero } from '@/features/industry-planner/components/BlueprintHero';
import { BuildCascade } from '@/features/industry-planner/components/BuildCascade';
import { PricingProvider } from '@/features/industry-planner/components/PricingProvider';
import { RecordRecentBlueprint } from '@/features/industry-planner/components/RecordRecentBlueprint';
import {
  getBlueprintPricing,
  getBlueprintStructure,
} from '@/features/industry-planner/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) return {};

  const structure = await getBlueprintStructure(id);
  if (!structure) return {};

  const title = `${structure.product.name} — Industry Planner`;
  const description = `Live Jita build cost and profit margin for ${structure.product.name} in Eve Online — full recursive material tree with hourly-updated prices.`;
  const canonicalUrl = `${SITE_URL}/industry/${id}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
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

// All page content depends on the [id] param. With no generateStaticParams,
// `params` is runtime data, so the whole planner streams from a <Suspense>
// boundary (the page chrome below is the static shell). The structure read is
// cached `'max'`, so the tree + hero chrome paint fast. The price read is
// started here but NOT awaited — the promise is handed to PricingProvider,
// which resolves it in its own isolated <Suspense> and fans the prices out to
// the hero margin and every cascade row. So prices + confidence stream in
// while the build structure never waits on them (the 3.0.5.1 lesson).
async function PlannerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();

  const structure = await getBlueprintStructure(id);
  if (!structure) notFound();

  const pricingPromise = getBlueprintPricing(id);

  return (
    <div className="w-full max-w-[1124px]">
      <h1 className="sr-only">{structure.product.name} — Industry Planner</h1>
      <RecordRecentBlueprint
        typeId={id}
        productTypeId={structure.product.typeId}
        name={structure.product.name}
      />

      <div className="mb-4">
        <Link
          href="/industry"
          className="text-[10px] tracking-[0.12em] uppercase text-muted"
        >
          ← Industry Planner
        </Link>
      </div>

      <PricingProvider structure={structure} pricingPromise={pricingPromise}>
        <BlueprintHero structure={structure} />
        <BuildCascade structure={structure} />
      </PricingProvider>
    </div>
  );
}

function PlannerSkeleton() {
  return (
    <div className="w-full max-w-[1124px] text-[11px] text-muted">Loading blueprint…</div>
  );
}

export default function BlueprintPlannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <Suspense fallback={<PlannerSkeleton />}>
        <PlannerContent params={params} />
      </Suspense>
    </div>
  );
}

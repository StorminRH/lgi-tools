import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { getMarketHistoryInputs } from '@/data/market-history/queries';
import { SITE_URL } from '@/config/site-url';
import { CockpitPlanner } from '@/features/industry-planner/components/CockpitPlanner';
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
    alternates: { canonical: `/industry/${id}` },
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
  // Warm seed of the product's history-derived score inputs (cached), started
  // in parallel and NOT awaited — handed to PricingProvider, which resolves it
  // in its own <Suspense> and refreshes it on view. Off the hero/margin path,
  // so it never delays the cost figures.
  const historyPromise = getMarketHistoryInputs([structure.product.typeId]);

  return (
    <div className="w-full">
      <h1 className="sr-only">{structure.product.name} — Industry Planner</h1>
      <RecordRecentBlueprint
        typeId={id}
        productTypeId={structure.product.typeId}
        name={structure.product.name}
      />

      <PricingProvider
        structure={structure}
        pricingPromise={pricingPromise}
        historyPromise={historyPromise}
      >
        <CockpitPlanner structure={structure} />
      </PricingProvider>
    </div>
  );
}

function PlannerSkeleton() {
  return <div className="w-full text-[11px] text-muted">Loading blueprint…</div>;
}

export default function BlueprintPlannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20">
        <Suspense fallback={<PlannerSkeleton />}>
          <PlannerContent params={params} />
        </Suspense>
      </div>
    </PageShell>
  );
}

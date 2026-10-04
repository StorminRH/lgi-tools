import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { IndustrySection, RememberPlanner } from '@/components/composition/industry-workspace/IndustryShell';
import { Skeleton } from '@/components/ui/skeleton';
import { JsonLd } from '@/components/composition/JsonLd';
import { getMarketHistoryInputs } from '@/data/market-history/queries';
import { observeCostPromise, startCostTimer } from '@/data/telemetry/cost-metrics';
import { SITE_URL } from '@/config/site-url';
import { loadNumericRouteEntity, parseNumericRouteId } from '@/transport/route-id';
import { buildBreadcrumbList } from '@/lib/structured-data';
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
  const result = await loadNumericRouteEntity(params, getBlueprintStructure);
  if (!result) return {};
  const { id, entity: structure } = result;

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

/**
 * Times the reads that still stream after the planner draws. Timing and
 * after() exist only at request time, so this runs in its own hole and the
 * cached structure above it can prerender and prefetch.
 */
async function PlannerOpenMetrics({
  id,
  pricing,
  history,
}: {
  id: number;
  pricing: Promise<unknown>;
  history: Promise<unknown>;
}) {
  await connection();
  const timer = startCostTimer();
  observeCostPromise(pricing, 'planner_open_timing', { stage: 'pricing', blueprintId: id }, timer);
  observeCostPromise(history, 'planner_open_timing', { stage: 'history', blueprintId: id }, timer);
  return null;
}

async function PlannerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseNumericRouteId(rawId);
  if (id === null) notFound();

  const structure = await getBlueprintStructure(id);
  if (!structure) notFound();

  const pricingPromise = getBlueprintPricing(id);
  const historyPromise = getMarketHistoryInputs([structure.product.typeId]);
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Industry Planner', url: `${SITE_URL}/industry` },
    { name: structure.product.name, url: `${SITE_URL}/industry/${id}` },
  ]);

  return (
    <div className="w-full">
      <JsonLd data={breadcrumbJsonLd} />
      <Suspense fallback={null}>
        <PlannerOpenMetrics id={id} pricing={pricingPromise} history={historyPromise} />
      </Suspense>
      <RememberPlanner blueprintTypeId={id} />
      <RecordRecentBlueprint typeId={id} productTypeId={structure.product.typeId} name={structure.product.name} />
      <h1 className="sr-only">{structure.product.name} — Industry Planner</h1>

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
  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      <Skeleton label="Loading blueprint" className="sr-only" />
      <div className="flex flex-col gap-3">
        <Skeleton aria-hidden="true" className="h-[22rem] w-full rounded-panel" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} aria-hidden="true" className={index < 4 ? 'col-span-2 h-24 rounded-card' : 'h-24 rounded-card'} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton aria-hidden="true" className="h-10 w-2/3 rounded-card" />
        <Skeleton aria-hidden="true" className="h-[28rem] w-full rounded-card" />
      </div>
    </div>
  );
}

export default function BlueprintPlannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <IndustrySection>
      <div className="flex flex-col items-center pb-20">
        <Suspense fallback={<PlannerSkeleton />}>
          <PlannerContent params={params} />
        </Suspense>
      </div>
    </IndustrySection>
  );
}

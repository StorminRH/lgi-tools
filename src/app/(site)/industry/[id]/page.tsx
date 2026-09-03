import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { JsonLd } from '@/components/composition/JsonLd';
import { getMarketHistoryInputs } from '@/data/market-history/queries';
import {
  elapsedCostTimer,
  emitCostMetric,
  observeCostPromise,
  startCostTimer,
} from '@/data/telemetry/cost-metrics';
import { SITE_URL } from '@/config/site-url';
import { loadNumericRouteEntity, parseNumericRouteId } from '@/transport/route-id';
import { buildBreadcrumbList } from '@/lib/structured-data';
import {
  cookieNameFor,
  plannerBuildCharacter,
  readPreferenceCookieValue,
} from '@/lib/preferences';
import { CockpitPlanner } from '@/features/industry-planner/components/CockpitPlanner';
import { PricingProvider } from '@/features/industry-planner/components/PricingProvider';
import { RecordRecentBlueprint } from '@/features/industry-planner/components/RecordRecentBlueprint';
import { TemplateLoader } from '@/features/industry-planner/components/TemplateLoader';
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

async function PlannerContent({ params }: { params: Promise<{ id: string }> }) {
  const plannerTimer = startCostTimer();
  const { id: rawId } = await params;
  const id = parseNumericRouteId(rawId);
  if (id === null) notFound();

  const structureTimer = startCostTimer();
  const structure = await getBlueprintStructure(id);
  if (!structure) notFound();
  emitCostMetric('planner_open_timing', {
    stage: 'structure',
    blueprintId: id,
    outcome: 'succeeded',
    durationMs: elapsedCostTimer(structureTimer),
  });

  const pricingTimer = startCostTimer();
  const pricingPromise = observeCostPromise(
    getBlueprintPricing(id),
    'planner_open_timing',
    { stage: 'pricing', blueprintId: id },
    pricingTimer,
  );
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Industry Planner', url: `${SITE_URL}/industry` },
    { name: structure.product.name, url: `${SITE_URL}/industry/${id}` },
  ]);
  const historyTimer = startCostTimer();
  const historyPromise = observeCostPromise(
    getMarketHistoryInputs([structure.product.typeId]),
    'planner_open_timing',
    { stage: 'history', blueprintId: id },
    historyTimer,
  );

  const initialBuildCharacterId = readPreferenceCookieValue(
    (await cookies()).get(cookieNameFor(plannerBuildCharacter))?.value,
    plannerBuildCharacter,
  );
  emitCostMetric('planner_open_timing', {
    stage: 'shell',
    blueprintId: id,
    outcome: 'succeeded',
    durationMs: elapsedCostTimer(plannerTimer),
  });

  return (
    <div className="w-full">
      <JsonLd data={breadcrumbJsonLd} />
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
        initialBuildCharacterId={initialBuildCharacterId}
      >
        <TemplateLoader structure={structure} />
        <CockpitPlanner structure={structure} />
      </PricingProvider>
    </div>
  );
}

function PlannerSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Skeleton label="Loading blueprint" className="sr-only" />
      <div className="grid gap-4 split:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <Skeleton aria-hidden="true" className="h-44 w-full" />
        <Skeleton aria-hidden="true" className="h-44 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 split:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} aria-hidden="true" className="h-24 w-full" />
        ))}
      </div>
      <Skeleton aria-hidden="true" className="h-64 w-full" />
    </div>
  );
}

export default function BlueprintPlannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageShell mode="detail">
      <div className="flex flex-col items-center pb-20">
        <Suspense fallback={<PlannerSkeleton />}>
          <PlannerContent params={params} />
        </Suspense>
      </div>
    </PageShell>
  );
}

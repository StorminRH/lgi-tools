import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SheetLayout } from '@/components/ui/sheet-layout';
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
  // The open-timing metrics schedule after() work, which only exists at request
  // time. The structure read is cached, so without this Next would prerender
  // down to the first metric and fail on the timestamp after() takes.
  await connection();
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
    <>
      <JsonLd data={breadcrumbJsonLd} />
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
    </>
  );
}

function PlannerSkeleton() {
  return (
    <SheetLayout
      aside={
        <>
          <Skeleton label="Loading blueprint" className="h-24 w-full rounded-card" />
          <Skeleton aria-hidden className="h-20 w-full rounded-card" />
          <Skeleton aria-hidden className="h-32 w-full rounded-card" />
          <Skeleton aria-hidden className="h-40 w-full rounded-card" />
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} aria-hidden className="h-24 w-full rounded-card" />
        ))}
      </div>
      <Skeleton aria-hidden className="h-64 w-full rounded-card" />
    </SheetLayout>
  );
}

export default function BlueprintPlannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PlannerSkeleton />}>
      <PlannerContent params={params} />
    </Suspense>
  );
}

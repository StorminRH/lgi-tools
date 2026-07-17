import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageShell } from '@/components/ui/page-shell';
import { JsonLd } from '@/components/JsonLd';
import { getMarketHistoryInputs } from '@/data/market-history/queries';
import {
  elapsedCostTimer,
  emitCostMetric,
  observeCostPromise,
  startCostTimer,
} from '@/data/telemetry/cost-metrics';
import { SITE_URL } from '@/config/site-url';
import { loadNumericRouteEntity, parseNumericRouteId } from '@/lib/route-id';
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

/**
 * Builds request-independent metadata for /industry/[id] from the route parameter and canonical
 * content source.
 */
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

// All page content depends on the [id] param. With no generateStaticParams,
// `params` is runtime data, so the whole planner streams from a <Suspense>
// boundary (the page chrome below is the static shell). The structure read is
// cached `'max'`, so the tree + hero chrome paint fast. The price read is
// started here but NOT awaited — the promise is handed to PricingProvider,
// which resolves it in its own isolated <Suspense> and fans the prices out to
// the hero margin and every cascade row. So prices + confidence stream in
// while the build structure never waits on them (the 3.0.5.1 lesson).
async function PlannerContent({ params }: { params: Promise<{ id: string }> }) {
  const plannerTimer = startCostTimer();
  const { id: rawId } = await params;
  // Require a bare digit string (see generateMetadata) — reject "12abc" → 404.
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
  // Warm seed of the product's history-derived score inputs (cached), started
  // in parallel and NOT awaited — handed to PricingProvider, which resolves it
  // in its own <Suspense> and refreshes it on view. Off the hero/margin path,
  // so it never delays the cost figures.
  const historyTimer = startCostTimer();
  const historyPromise = observeCostPromise(
    getMarketHistoryInputs([structure.product.typeId]),
    'planner_open_timing',
    { stage: 'history', blueprintId: id },
    historyTimer,
  );

  // The build-character preference's cookie mirror (ACCOUNT.8) — read here in
  // the Suspense hole (never the static shell) and threaded as the hook's
  // serverValue, so a hard reload renders the saved pick without flashing the
  // active character while the preference GET resolves (the /skills strip idiom).
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
      {/* Entity-detail pages self-title: they open content-first (no visible
          PageHead), so the page title lives in this sr-only <h1> for a11y/SEO.
          PageHead is the list/section header; the detail is its own surface. */}
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
        {/* The ?plan= replay slot — inside the provider (it drives the public
            setters) and under the page Suspense (it reads searchParams). */}
        <TemplateLoader structure={structure} />
        <CockpitPlanner structure={structure} />
      </PricingProvider>
    </div>
  );
}

function PlannerSkeleton() {
  return <LoadingLabel label="Loading blueprint…" className="block w-full" />;
}

/**
 * Renders the /industry/[id] route surface and owns its page-level composition, metadata boundary,
 * and fallback presentation.
 */
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

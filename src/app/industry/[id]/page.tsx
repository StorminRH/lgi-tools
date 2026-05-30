import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Pill } from '@/components/ui/pill';
import { SITE_URL } from '@/config/site-url';
import { CostPanelView } from '@/features/industry-planner/components/CostPanelView';
import { MaterialTree } from '@/features/industry-planner/components/MaterialTree';
import { activityLabel } from '@/features/industry-planner/industry-styles';
import {
  getBlueprintPricing,
  getBlueprintStructure,
} from '@/features/industry-planner/queries';
import type { BlueprintStructure } from '@/features/industry-planner/types';
import { formatQuantity } from '@/lib/format';

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

// The priced cost panel — the only ESI-backed read. Isolated in its own
// <Suspense> hole so the structural tree paints first and prices stream in
// beside it (never blocking the tree on the price read).
async function PricedCostPanel({
  blueprintId,
  structure,
}: {
  blueprintId: number;
  structure: BlueprintStructure;
}) {
  const pricing = await getBlueprintPricing(blueprintId);
  return <CostPanelView pricing={pricing} structure={structure} />;
}

// All page content depends on the [id] param. With no generateStaticParams,
// `params` is runtime data, so the whole planner streams from a <Suspense>
// boundary (the page chrome below is the static shell). The structure read is
// cached `'max'`, so the tree resolves fast; the priced cost panel streams in a
// nested hole after it.
async function PlannerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();

  const structure = await getBlueprintStructure(id);
  if (!structure) notFound();

  return (
    <div className="w-full max-w-[1100px]">
      <h1 className="sr-only">{structure.product.name} — Industry Planner</h1>

      <div className="mb-4">
        <Link
          href="/industry"
          className="text-[10px] tracking-[0.12em] uppercase text-muted"
        >
          ← Industry Planner
        </Link>
      </div>

      <header className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display font-bold text-[22px] text-name leading-[1.1]">
            {structure.product.name}
          </span>
          <Pill tone="blue" size="sm">
            {activityLabel(structure.activityId)}
          </Pill>
        </div>
        <div className="text-[11px] text-muted mt-1.5">
          Builds {formatQuantity(structure.product.quantityPerRun)} per run · margin before job fees
        </div>
      </header>

      <div className="grid gap-4 items-start lg:grid-cols-2">
        <MaterialTree structure={structure} />
        <Suspense fallback={<CostPanelView pricing={null} structure={structure} />}>
          <PricedCostPanel blueprintId={id} structure={structure} />
        </Suspense>
      </div>
    </div>
  );
}

function PlannerSkeleton() {
  return (
    <div className="w-full max-w-[1100px] text-[11px] text-muted">Loading blueprint…</div>
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

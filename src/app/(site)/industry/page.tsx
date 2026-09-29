import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHead } from '@/components/ui/page-head';
import { Skeleton } from '@/components/ui/skeleton';
import { SITE_URL } from '@/config/site-url';
import { activeJobCharacterIds, corpJobsAccess } from './active-job-character-ids';
import { IndustryOverview } from './IndustryOverview';
import { IndustryRail } from './IndustryRail';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Your Eve Online industry workspace — live jobs and slots, build plans with cost and margin at live Jita rates, market research, and saved build templates.',
  alternates: { canonical: '/industry' },
  openGraph: {
    title: 'Industry Planner — LGI.tools',
    description:
      'Search any Eve Online blueprint to plan its build — cost, profit margin, and price confidence at live Jita rates.',
    url: `${SITE_URL}/industry`,
    type: 'website',
    images: ['/logo.png'],
  },
};

async function OverviewContent() {
  const [characterIds, corp] = await Promise.all([activeJobCharacterIds(), corpJobsAccess()]);
  return (
    <IndustryOverview
      characterIds={characterIds}
      corpEligibleCharacterIds={corp.eligibleCharacterIds}
      signedIn={corp.hasLinkedCharacters}
    />
  );
}

const EMPTY_SUMMARIES = { jobs: [], plan: [], research: [], templates: [] };

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10">
      <div className="min-w-0">
        <IndustryRail summaries={EMPTY_SUMMARIES} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton label="Loading your industry overview" className="h-44 w-full rounded-card" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton aria-hidden className="h-56 w-full rounded-card" />
          <Skeleton aria-hidden className="h-56 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}

export default function IndustryOverviewPage() {
  return (
    <>
      <PageHead size="hero" crumb="industry" title="Industry" />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { Skeleton } from '@/components/ui/skeleton';
import { SITE_URL } from '@/config/site-url';
import { IndustryTypedHint } from '@/features/industry-planner/components/IndustryTypedHint';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { IndustrySlotMeta } from '@/features/industry-jobs/components/IndustrySlotMeta';
import { activeJobCharacterIds, corpJobsAccess } from './active-job-character-ids';
import { IndustryDashboardGrid } from './IndustryDashboardGrid';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Your Eve Online manufacturing dashboard — search any blueprint to see its build cost, profit margin, and price confidence at live Jita rates, jump back to builds you recently viewed, and watch your live industry jobs.',
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

async function DashboardSections() {
  const [characterIds, corp] = await Promise.all([activeJobCharacterIds(), corpJobsAccess()]);
  return (
    <IndustryDashboardGrid
      characterIds={characterIds}
      corpEligibleCharacterIds={corp.eligibleCharacterIds}
      hasLinkedCharacters={corp.hasLinkedCharacters}
      reconnectAction={
        <LinkCharacterButton
          label="Grant corp jobs access"
          emphasis="reconnect"
          callbackURL="/industry"
        />
      }
    />
  );
}

async function SlotMeta() {
  const [characterIds, corp] = await Promise.all([activeJobCharacterIds(), corpJobsAccess()]);
  return (
    <IndustrySlotMeta
      characterIds={characterIds}
      corpEligibleCharacterIds={corp.eligibleCharacterIds}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 split:grid-cols-2">
      {(
        [
          ['Recents', 'panel'],
          ['Templates', 'panel'],
          ['Active jobs', 'loading'],
          ['Corporation industry jobs', 'loading'],
        ] as const
      ).map(([label, kind]) => (
        <section key={label}>
          <SectionLabel className="mb-cluster">{label}</SectionLabel>

          <Card className="overflow-hidden" aria-label={`Loading ${label.toLowerCase()}`}>
            <div className="flex items-center gap-3 px-3.5 py-3">
              {kind === 'loading' ? (
                <Skeleton className="size-9 rounded-full" />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className={kind === 'panel' ? 'h-3 w-3/5' : 'h-3 w-2/5'} />
                <Skeleton className="h-2.5 w-1/3" />
              </div>

            </div>

          </Card>

        </section>

      ))}
    </div>

  );
}

export default function IndustryDashboardPage() {
  return (
    <PageShell mode="workspace">
      <PageHead
        size="hero"
        crumb="industry"
        title="Industry"
        meta={
          <Suspense fallback={null}>
            <SlotMeta />
          </Suspense>

        }
      />

      <div className="pb-16 flex flex-col gap-9">
        <IndustryTypedHint />

        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardSections />
        </Suspense>

      </div>

    </PageShell>

  );
}

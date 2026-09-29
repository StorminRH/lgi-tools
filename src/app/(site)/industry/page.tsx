import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { Skeleton } from '@/components/ui/skeleton';
import { SITE_URL } from '@/config/site-url';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { IndustrySlotMeta } from '@/features/industry-jobs/components/IndustrySlotMeta';
import { activeJobCharacterIds, corpJobsAccess } from './active-job-character-ids';
import { WorkspaceNav, WorkspaceSkeleton } from '@/components/composition/industry-workspace/WorkspaceStates';
import { IndustryLanding } from './IndustryLanding';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Your Eve Online industry workspace — set up production profiles for your characters and structures, search any blueprint to see its build cost, profit margin, and price confidence at live Jita rates, and watch your live industry jobs.',
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
    <IndustryLanding
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
    <>
      <WorkspaceSkeleton />
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
                {kind === 'loading' ? <Skeleton className="size-9 rounded-full" /> : null}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className={kind === 'panel' ? 'h-3 w-3/5' : 'h-3 w-2/5'} />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}

export default function IndustryDashboardPage() {
  return (
    <PageShell mode="workspace">
      <h1 className="sr-only">Industry</h1>
      <div className="pb-16 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <WorkspaceNav />
          <Suspense fallback={null}>
            <SlotMeta />
          </Suspense>
        </div>

        <div className="flex flex-col gap-9">
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardSections />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IndustryWorkspaceTabs } from '@/components/composition/industry-workspace/IndustryWorkspaceTabs';
import { WorkspaceSkeleton } from '@/components/composition/industry-workspace/WorkspaceStates';
import { PageShell } from '@/components/ui/page-shell';
import { SITE_URL } from '@/config/site-url';
import { SavedPlansManager } from '@/features/industry-planner/components/SavedPlansManager';
import { activeJobCharacterIds, corpJobCharacterIds } from './active-job-character-ids';
import { IndustryLanding } from './IndustryLanding';
import { JobsContent, JobsLoading } from './JobsContent';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Your Eve Online industry workspace — set up production profiles for your characters and structures: who runs reactions, components and final assembly, where, and with what skills and job slots.',
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

function jobCharacterIds() {
  return Promise.all([activeJobCharacterIds(), corpJobCharacterIds()]);
}

async function Workspace() {
  const [characterIds, corpIds] = await jobCharacterIds();
  return <IndustryLanding characterIds={characterIds} corpEligibleCharacterIds={corpIds} />;
}

export default function IndustryDashboardPage() {
  return (
    <PageShell mode="workspace">
      <h1 className="sr-only">Industry</h1>
      <div className="pb-16 flex flex-col gap-5">
        <Suspense fallback={<WorkspaceSkeleton />}>
          <IndustryWorkspaceTabs
            profiles={
              <Suspense fallback={<WorkspaceSkeleton />}>
                <Workspace />
              </Suspense>
            }
            plans={<SavedPlansManager />}
            jobs={
              <Suspense fallback={<JobsLoading />}>
                <JobsContent />
              </Suspense>
            }
          />
        </Suspense>
      </div>
    </PageShell>
  );
}

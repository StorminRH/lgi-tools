import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IndustrySection } from '@/components/composition/industry-workspace/IndustryShell';
import { WorkspaceSkeleton } from '@/components/composition/industry-workspace/WorkspaceStates';
import { SITE_URL } from '@/config/site-url';
import { getStructureTypes } from '@/data/eve-data/queries';
import { activeJobCharacterIds, corpJobCharacterIds } from './active-job-character-ids';
import { IndustryLanding } from './IndustryLanding';

export const metadata: Metadata = {
  title: 'Industry Planner',
  description:
    'Your Eve Online industry workspace — set up production profiles for your characters and structures: who builds what, where, and with what skills and job slots.',
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
  const [[characterIds, corpIds], structureTypes] = await Promise.all([jobCharacterIds(), getStructureTypes()]);
  const hulls = structureTypes.map((t) => ({ typeId: t.typeId, name: t.name }));
  return <IndustryLanding characterIds={characterIds} corpEligibleCharacterIds={corpIds} hulls={hulls} />;
}

export default function IndustryProfilesPage() {
  return (
    <IndustrySection>
      <h1 className="sr-only">Industry</h1>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <Workspace />
      </Suspense>
    </IndustrySection>
  );
}

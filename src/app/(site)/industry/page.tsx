import { Suspense } from 'react';
import { IndustrySection } from '@/components/composition/industry-workspace/IndustryShell';
import { WorkspaceSkeleton } from '@/components/composition/industry-workspace/WorkspaceStates';
import { getStructureTypes } from '@/data/eve-data/queries';
import { buildPageMetadata } from '@/lib/page-metadata';
import { jobCharacterIds } from './industry-characters';
import { IndustryLanding } from './IndustryLanding';

export const metadata = buildPageMetadata({
  title: 'Industry Planner',
  description:
    'Your Eve Online industry workspace — set up production profiles for your characters and structures: who builds what, where, and with what skills and job slots.',
  canonical: '/industry',
});

async function Workspace() {
  const [{ jobIds, corpIds }, structureTypes] = await Promise.all([jobCharacterIds(), getStructureTypes()]);
  const hulls = structureTypes.map((t) => ({ typeId: t.typeId, name: t.name }));
  return <IndustryLanding characterIds={jobIds} corpEligibleCharacterIds={corpIds} hulls={hulls} />;
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

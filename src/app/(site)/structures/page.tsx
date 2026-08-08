import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import { auth } from '@/platform/auth/auth';
import { CustomStructureBuilder } from '@/features/custom-structures/components/CustomStructureBuilder';
import { listCustomStructures } from '@/features/custom-structures/queries';
import { CorpStructureSection } from '@/features/owned-structures/components/CorpStructureSection';

// Per-user, session-gated: the content (auth check, the saved-list read) is a
// request-time dynamic hole, so only the page container prerenders. The SDE
// picker options are deploy-static cached reads — composed in the same hole, so
// the whole interactive builder hydrates once the gate resolves.
async function StructuresContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const [structureTypes, structureRigs, saved, corps] = await Promise.all([
    getStructureTypes(),
    getStructureRigs(),
    listCustomStructures(session.user.id),
    getCorpStructuresPageData(session.user.id),
  ]);

  return (
    <div className="flex w-full flex-col gap-6">
      <Card>
        <SectionHeader size="md" label="Custom structures" hint={`${saved.length} saved`} />
        <div className="px-3.5 py-3.5">
          <CustomStructureBuilder
            structureTypes={structureTypes}
            structureRigs={structureRigs}
            initial={saved}
          />
        </div>
      </Card>

      <CorpStructureSection corps={corps} structureTypes={structureTypes} structureRigs={structureRigs} />
    </div>
  );
}

function StructuresLoading() {
  // One block only: the corp-sharing section is membership-conditional, so a
  // phantom second card would shift more than it saves on most accounts.
  return (
    <div className="flex w-full flex-col gap-6">
      <Skeleton label="Loading structures" className="h-56 w-full rounded-card" />
    </div>
  );
}

/**
 * Renders the /structures route surface and owns its page-level composition, metadata boundary,
 * and fallback presentation. PageHead stays in the static shell; the session-gated builder streams.
 */
export default function StructuresPage() {
  return (
    <PageShell mode="reading">
      <div className="flex flex-col items-center gap-0 pb-20">
        <PageHead
          crumb="structures"
          title="Structures"
          subtitle="Build a custom structure to place a build in, or share your corporation’s structures with every member — pick a type and rigs to apply their bonuses in the planner."
        />
        <Suspense fallback={<StructuresLoading />}>
          <StructuresContent />
        </Suspense>
      </div>
    </PageShell>
  );
}

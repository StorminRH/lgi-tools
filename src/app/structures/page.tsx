import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionHeader } from '@/components/ui/section-header';
import { getCorpStructuresPageData } from '@/db/corp-structures-sync';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import { auth } from '@/features/auth/auth';
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
    <>
      <div className="w-full max-w-[760px]">
        <PageHead
          crumb="structures"
          title="Structures"
          subtitle="Build a custom structure to place a build in, or share your corporation’s structures with every member — pick a type and rigs to apply their bonuses in the planner."
        />
      </div>

      <div className="w-full max-w-[760px]">
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
      </div>

      <CorpStructureSection corps={corps} structureTypes={structureTypes} structureRigs={structureRigs} />
    </>
  );
}

export default function StructuresPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center gap-0 pb-20">
        <Suspense fallback={<LoadingLabel />}>
          <StructuresContent />
        </Suspense>
      </div>
    </PageShell>
  );
}

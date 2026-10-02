import { headers } from 'next/headers';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { IndustryStructureBuilder } from '@/components/composition/industry-workspace/IndustryStructureBuilder';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { auth } from '@/composition/auth';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import { listCustomStructures } from '@/features/custom-structures/queries';
import { CorpStructureSection } from '@/features/owned-structures/components/CorpStructureSection';

export async function CustomStructuresContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return (
    <div className="flex flex-col items-center gap-4">
      <EmptyState>Sign in to build and manage your structures.</EmptyState>
      <EveSignInButton callbackURL="/industry?panel=structures" />
    </div>
  );

  const [structureTypes, structureRigs, initial, corps] = await Promise.all([
    getStructureTypes(),
    getStructureRigs(),
    listCustomStructures(session.user.id),
    getCorpStructuresPageData(session.user.id),
  ]);
  return (
    <div className="flex w-full flex-col gap-6">
      <Card>
        <SectionHeader size="md" label="Custom structures" hint={`${initial.length} saved`} />
        <div className="px-3.5 py-3.5">
          <IndustryStructureBuilder structureTypes={structureTypes} structureRigs={structureRigs} initial={initial} />
        </div>
      </Card>
      <CorpStructureSection corps={corps} structureTypes={structureTypes} structureRigs={structureRigs} />
    </div>
  );
}

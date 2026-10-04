import { headers } from 'next/headers';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { StructuresManager } from '@/components/composition/industry-workspace/StructuresManager';
import { EmptyState } from '@/components/ui/empty-state';
import { auth } from '@/composition/auth';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import { listCustomStructures } from '@/features/custom-structures/queries';

export async function CustomStructuresContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.characterId == null) return (
    <div className="flex flex-col items-center gap-4">
      <EmptyState>Sign in to build and manage your structures.</EmptyState>
      <EveSignInButton callbackURL="/industry?panel=structures" />
    </div>
  );

  const [structureTypes, structureRigs, initialCustom, initialCorps] = await Promise.all([
    getStructureTypes(),
    getStructureRigs(),
    listCustomStructures(session.user.id),
    getCorpStructuresPageData(session.user.id),
  ]);
  return (
    <StructuresManager
      owner={{ userId: session.user.id, characterId: session.characterId }}
      structureTypes={structureTypes}
      structureRigs={structureRigs}
      initialCustom={initialCustom}
      initialCorps={initialCorps}
    />
  );
}

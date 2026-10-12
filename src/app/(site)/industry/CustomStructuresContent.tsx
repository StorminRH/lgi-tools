import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { StructuresManager } from '@/components/composition/industry-workspace/StructuresManager';
import { EmptyState } from '@/components/ui/empty-state';
import { getFullSession } from '@/composition/session';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { getStructureRigs, getStructureTypes } from '@/data/eve-data/queries';
import { listCustomStructures } from '@/features/custom-structures/queries';

export async function CustomStructuresContent() {
  const session = await getFullSession();
  if (!session || session.characterId == null) return (
    <div className="flex flex-col items-center gap-4">
      <EmptyState>Sign in to build and manage your structures.</EmptyState>
      <EveSignInButton callbackURL="/industry?panel=structures" />
    </div>
  );

  const [structureTypes, structureRigs, initialCustom, corps] = await Promise.all([
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
      initialCorps={corps.corporations}
    />
  );
}

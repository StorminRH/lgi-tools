import { Suspense } from 'react';
import { getFullSession } from '@/composition/session';
import { NewGuideForm } from '@/features/codex/components/NewGuideForm';
import { CodexIndex, codexIndexMetadata, type SearchParams } from '../codex-index';

export const metadata = codexIndexMetadata;

async function NewGuideSlot() {
  const session = await getFullSession();
  return session?.isAdmin ? <NewGuideForm /> : null;
}

export default function CodexAdminIndexPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CodexIndex
      searchParams={searchParams}
      actions={
        <Suspense fallback={null}>
          <NewGuideSlot />
        </Suspense>
      }
    />
  );
}

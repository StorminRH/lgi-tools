import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { getSession, isAdmin } from '@/composition/session';
import { PrototypesGallery } from './PrototypesGallery';

export const metadata: Metadata = {
  title: 'Glass Prototypes — LGI.tools',
  robots: { index: false },
};

async function AdminPrototypes() {
  const session = await getSession();
  if (!isAdmin(session)) redirect('/?auth_error=admin_required');
  return <PrototypesGallery />;
}

export default function PrototypesPage() {
  return (
    <PageShell mode="workspace">
      <PageHead
        size="compact"
        crumb="admin / glass prototypes"
        title="Glass prototypes"
        subtitle="Candidate looks for the primitive refresh — pick one per family"
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" label="Loading prototypes" />}>
        <AdminPrototypes />
      </Suspense>
    </PageShell>
  );
}

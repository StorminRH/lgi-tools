import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { getSession, isAdmin } from '@/platform/auth/session';
import { PrimitivesDemo } from './PrimitivesDemo';

/** Static search and social metadata for the /preview/primitives route. */
export const metadata: Metadata = {
  title: 'UI Primitive Reference — LGI.tools',
  robots: { index: false },
};

async function AdminPrimitiveReference() {
  const session = await getSession();
  if (!isAdmin(session)) redirect('/?auth_error=admin_required');
  return <PrimitivesDemo />;
}

/**
 * Renders the /preview/primitives route surface and owns its page-level composition, metadata
 * boundary, and fallback presentation.
 */
export default function PrimitiveReferencePage() {
  return (
    <PageShell>
      <PageHead
        crumb="admin / primitive reference"
        title="Future primitives"
        subtitle="Inset Instrument · rendered system reference"
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" label="Loading primitive reference" />}>
        <AdminPrimitiveReference />
      </Suspense>
    </PageShell>
  );
}

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { NavRailLayout } from '@/components/ui/nav-rail';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { AdminGate } from './AdminGate';
import { AdminRail, AdminRailFallback } from './AdminRail';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <Suspense fallback={<LoadingLabel />}>
        <AdminGate>
          <div className="relative flex flex-col gap-0 pb-20">
            <PageHead title="Admin" />
            <NavRailLayout
              data-admin-layout
              rail={
                <Suspense fallback={<AdminRailFallback />}>
                  <AdminRail />
                </Suspense>
              }
              contentProps={{ 'data-admin-content': true }}
              contentClassName="flex flex-col gap-5"
            >
              {children}
            </NavRailLayout>
          </div>
        </AdminGate>
      </Suspense>
    </PageShell>
  );
}

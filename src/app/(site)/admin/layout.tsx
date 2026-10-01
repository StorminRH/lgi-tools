import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
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
            <div
              data-admin-layout
              className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8"
            >
              <Suspense fallback={<AdminRailFallback />}>
                <AdminRail />
              </Suspense>
              <div data-admin-content className="flex min-w-0 flex-col gap-5">
                {children}
              </div>
            </div>
          </div>
        </AdminGate>
      </Suspense>
    </PageShell>
  );
}

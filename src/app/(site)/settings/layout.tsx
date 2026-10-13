import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { NavRailLayout } from '@/components/ui/nav-rail';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SettingsNav, SettingsNavFallback } from './settings-nav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col gap-0 pb-20">
        <PageHead title="Settings" />
        <NavRailLayout
          data-settings-layout
          columns="reading"
          rail={
            <Suspense fallback={<SettingsNavFallback />}>
              <SettingsNav />
            </Suspense>
          }
          contentProps={{ 'data-settings-content': true }}
          contentClassName="flex flex-col gap-6"
        >
          {children}
        </NavRailLayout>
      </div>
    </PageShell>
  );
}

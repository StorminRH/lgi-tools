import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SettingsRail, SettingsRailFallback } from './settings-rail';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col gap-0 pb-20">
        <PageHead
          crumb="settings"
          title="Settings"
          subtitle="Everything that applies across your account — characters, corporations, preferences, and stored data"
        />
        <div
          data-settings-layout
          className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,var(--container-reading))] lg:gap-10"
        >
          <Suspense fallback={<SettingsRailFallback />}>
            <SettingsRail />
          </Suspense>
          <div data-settings-content className="flex min-w-0 flex-col gap-6">
            {children}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

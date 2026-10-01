import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SettingsNav, SettingsNavFallback } from './settings-nav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <div className="relative flex flex-col gap-0 pb-20 lg:max-w-[calc(220px+2.5rem+var(--container-reading))]">
        <PageHead title="Settings" />
        <div
          data-settings-layout
          className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,var(--container-reading))] lg:gap-10"
        >
          {/* Only /settings/access/[userId] suspends here: usePathname cannot
              resolve an unknown param while prerendering. */}
          <Suspense fallback={<SettingsNavFallback />}>
            <SettingsNav />
          </Suspense>
          <div data-settings-content className="flex min-w-0 flex-col gap-6">
            {children}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

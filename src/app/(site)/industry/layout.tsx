import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { IndustryTabs, IndustryTabStrip } from './IndustryTabs';

export default function IndustryLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col pb-20">
        {/* Only /industry/[id] suspends here: the selected segment is an unknown
            param while prerendering, and a blueprint id is always the job plan. */}
        <Suspense fallback={<IndustryTabStrip active="plan" />}>
          <IndustryTabs />
        </Suspense>
        {children}
      </div>
    </PageShell>
  );
}

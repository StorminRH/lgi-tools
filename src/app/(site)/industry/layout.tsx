import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { activeJobCharacterIds, corpJobsAccess } from './active-job-character-ids';
import { IndustryTabs, IndustryTabsShell, IndustryTabStrip } from './IndustryTabs';

async function LiveIndustryTabs() {
  const [characterIds, corp] = await Promise.all([activeJobCharacterIds(), corpJobsAccess()]);
  return (
    <IndustryTabs
      live={{
        signedIn: corp.hasLinkedCharacters,
        characterIds,
        corpEligibleCharacterIds: corp.eligibleCharacterIds,
      }}
    />
  );
}

export default function IndustryLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col pb-20">
        <Suspense
          fallback={
            // Only /industry/[id] suspends the shell: the selected segment is an
            // unknown param while prerendering, and a blueprint id is always the job plan.
            <Suspense fallback={<IndustryTabStrip active="plan" summaries={null} />}>
              <IndustryTabsShell />
            </Suspense>
          }
        >
          <LiveIndustryTabs />
        </Suspense>
        {children}
      </div>
    </PageShell>
  );
}

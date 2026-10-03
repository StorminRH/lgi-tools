import { Suspense, type ReactNode } from 'react';
import {
  IndustryNav,
  IndustryNavFallback,
  StructuresDrawer,
} from '@/components/composition/industry-workspace/IndustryShell';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomStructuresContent } from './CustomStructuresContent';

/**
 * The industry planner's one workspace: the section tabs and the structures
 * drawer stay put while Profiles, the Planner and Active jobs swap beneath.
 */
export default function IndustryLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col gap-5 pb-16">
        <Suspense fallback={<IndustryNavFallback />}>
          <IndustryNav />
        </Suspense>
        {children}
      </div>
      <Suspense fallback={null}>
        <StructuresDrawer>
          <Suspense fallback={<Skeleton label="Loading custom structures" className="h-56 w-full rounded-card" />}>
            <CustomStructuresContent />
          </Suspense>
        </StructuresDrawer>
      </Suspense>
    </PageShell>
  );
}

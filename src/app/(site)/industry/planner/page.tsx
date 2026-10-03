import type { Metadata } from 'next';
import { IndustrySection } from '@/components/composition/industry-workspace/IndustryShell';
import { BlueprintSearch } from '@/features/industry-planner/components/BlueprintSearch';

export const metadata: Metadata = {
  title: 'Planner — Industry Planner',
  description: 'Search any Eve Online blueprint to plan its build: cost, profit margin and build time at live Jita prices.',
  alternates: { canonical: '/industry/planner' },
};

export default function EmptyPlannerPage() {
  return (
    <IndustrySection>
      <h1 className="sr-only">Planner</h1>
      <div className="flex min-h-[50vh] items-center justify-center px-1">
        <div className="w-full max-w-xl">
          <BlueprintSearch />
        </div>
      </div>
    </IndustrySection>
  );
}

import { IndustrySection, RememberPlanner } from '@/components/composition/industry-workspace/IndustryShell';
import { BlueprintSearch } from '@/features/industry-planner/components/BlueprintSearch';
import { BlueprintShelves } from '@/features/industry-planner/components/BlueprintShelves';
import { buildPageMetadata } from '@/lib/page-metadata';

export const metadata = buildPageMetadata({
  title: 'Planner — Industry Planner',
  description: 'Search any Eve Online blueprint to plan its build: cost, profit margin and build time at live Jita prices.',
  canonical: '/industry/planner',
});

export default function EmptyPlannerPage() {
  return (
    <IndustrySection>
      <RememberPlanner />
      <h1 className="sr-only">Planner</h1>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-1 pt-4">
        <BlueprintSearch />
        <BlueprintShelves />
      </div>
    </IndustrySection>
  );
}

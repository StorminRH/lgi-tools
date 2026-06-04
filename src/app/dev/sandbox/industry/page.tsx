import { getBlueprintStructure } from '@/features/industry-planner/queries';
import { PlannerMock, type MockBlueprint, type MockSummary } from './PlannerMock';

// A mockup of the real planner page (hero + build plan) so the hybrid flow view
// can be evaluated in context. Real SDE structures (fixed ids, cached 'max' → the
// page prerenders static, like /industry); the hero summary numbers are static
// mock figures (no live pricing wired in).

const SAMPLES: { id: number; sub: string; summary: MockSummary }[] = [
  { id: 691, sub: 'T1 frigate', summary: { inputCost: 482_000, revenue: 596_000, margin: 114_000, marginPct: 23.6 } },
  { id: 29991, sub: 'T3 cruiser', summary: { inputCost: 284_000_000, revenue: 313_000_000, margin: 29_000_000, marginPct: 10.2 } },
  { id: 23758, sub: 'Carrier', summary: { inputCost: 1_204_000_000, revenue: 1_356_000_000, margin: 152_000_000, marginPct: 12.6 } },
];

export default async function PlannerMockPage() {
  const loaded = await Promise.all(
    SAMPLES.map(async (s) => ({ ...s, structure: await getBlueprintStructure(s.id) })),
  );
  const blueprints: MockBlueprint[] = loaded
    .filter((b): b is typeof b & { structure: NonNullable<typeof b.structure> } => b.structure !== null)
    .map((b) => ({
      id: String(b.id),
      label: b.structure.product.name,
      sub: b.sub,
      structure: b.structure,
      summary: b.summary,
    }));

  return (
    <div className="flex flex-col items-center px-4 pt-12 pb-20 sm:px-6">
      <PlannerMock blueprints={blueprints} />
    </div>
  );
}

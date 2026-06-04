import { getBlueprintStructure } from '@/features/industry-planner/queries';
import { SandboxHeader } from '../../_shared/sandbox-ui';
import { FlowExplorer, type FlowBlueprint } from './FlowExplorer';

// Focused explorer for the flow-connector tree, fed REAL SDE build trees (the
// same `getBlueprintStructure` the live planner uses). The ids are fixed and the
// read is `'use cache'`/`'max'` with no request-time input, so this prerenders
// into the static shell (like `/industry`). `next build` therefore needs a
// reachable DATABASE_URL — Vercel provides it; export it for a local build.

const SAMPLES: { id: number; sub: string }[] = [
  { id: 691, sub: 'T1 frigate · small' }, // Rifter
  { id: 29991, sub: 'T3 strategic cruiser · medium' }, // Loki
  { id: 23758, sub: 'Carrier · large' }, // Archon
];

export default async function FlowExplorerPage() {
  const loaded = await Promise.all(
    SAMPLES.map(async (s) => ({ ...s, structure: await getBlueprintStructure(s.id) })),
  );
  const blueprints: FlowBlueprint[] = loaded
    .filter((b): b is typeof b & { structure: NonNullable<typeof b.structure> } => b.structure !== null)
    .map((b) => ({ id: String(b.id), label: b.structure.product.name, sub: b.sub, structure: b.structure }));

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Flow Connectors — Explorer"
        subtitle="Real SDE builds · click a node to zoom in · fits width, grows down"
      />
      <FlowExplorer blueprints={blueprints} />
    </div>
  );
}

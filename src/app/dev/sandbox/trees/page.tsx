import Link from 'next/link';
import { BuildFlow } from '@/features/industry-planner/components/BuildFlow';
import { MOCK_STRUCTURE } from '../_shared/mock-build';
import { SandboxHeader, VariantFrame } from '../_shared/sandbox-ui';
import { DensityTable } from './DensityTable';
import { IndentedOutline } from './IndentedOutline';
import { NestedCards } from './NestedCards';
import { RadialDepth } from './RadialDepth';

// Five build-tree displays, each fed the identical MOCK_STRUCTURE (a Wolf
// assault-frigate build) so they compare like-for-like. Static shell — the
// sample data is a hardcoded literal; the interactive bits are client islands.

export default function TreesPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="Build-tree Displays"
        subtitle="5 variants · same Wolf build · pick one to port to the planner"
      />
      <div className="w-full max-w-[1100px] flex flex-col gap-12">
        <VariantFrame
          tag="Tree v1"
          title="Indented outline"
          notes="Native <details> collapse, no JS state. Closest to a conventional file-tree; scales to deep capital trees. Would need keyboard-focus styling if chosen."
        >
          <IndentedOutline structure={MOCK_STRUCTURE} />
        </VariantFrame>

        <VariantFrame
          tag="Tree v2"
          title="Nested cards"
          notes="Build depth reads as physical containment; each card lifts on hover. Heavy nesting for very deep trees — best for shallow/mid builds."
        >
          <NestedCards structure={MOCK_STRUCTURE} />
        </VariantFrame>

        <VariantFrame
          tag="Tree v3"
          title="Flow connectors"
          notes="SVG node graph; click any buildable node to zoom into its build, the breadcrumb zooms back out. Fits the page width and grows downward (no horizontal scroll), so deep capital trees get tall instead of wide."
        >
          <Link
            href="/dev/sandbox/trees/flow"
            className="inline-flex mb-3 text-[10px] tracking-[0.12em] uppercase text-isk hover:underline"
          >
            Open explorer — real Rifter · Loki · Archon builds, click to zoom ▸
          </Link>
          <BuildFlow structure={MOCK_STRUCTURE} />
        </VariantFrame>

        <VariantFrame
          tag="Tree v4"
          title="Radial depth rings"
          notes="Product at centre, each build depth a ring. Striking for showing depth at a glance; label overlap on wide trees would need collision handling."
        >
          <RadialDepth structure={MOCK_STRUCTURE} />
        </VariantFrame>

        <VariantFrame
          tag="Tree v5"
          title="Density table"
          notes="Flattened, scannable, with a comfortable ↔ compact toggle. Most information-dense; loses the parent/child spatial cue that v1–v4 keep."
        >
          <DensityTable structure={MOCK_STRUCTURE} />
        </VariantFrame>
      </div>
    </div>
  );
}

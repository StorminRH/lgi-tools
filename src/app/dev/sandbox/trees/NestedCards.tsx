import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TypeIcon } from '@/components/ui/type-icon';
import type { BlueprintStructure, BuildNode } from '@/features/industry-planner/types';
import { formatNodeQty, sortInputs, type Display } from './tree-shared';

// Tree v2 — Nested Cards. Each buildable node is a bordered card; its inputs
// nest inside an inset well, so build depth reads as physical containment. The
// well tint deepens with depth and each card lifts slightly on hover.

function NodeCard({ node, display, depth }: { node: BuildNode; display: Display; depth: number }) {
  const d = display[node.typeId];
  const buildable = node.inputs.length > 0;

  return (
    <div className="sbx-node border border-border-soft bg-bg rounded-[4px] overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <TypeIcon typeId={node.typeId} size={26} mono={d.name.slice(0, 2)} />
        <span className="text-[12px] text-name truncate">{d.name}</span>
        <Pill tone={d.tone}>{d.label}</Pill>
        <span className="ml-auto text-[11px] text-muted whitespace-nowrap">
          × {formatNodeQty(node.quantity)}
        </span>
      </div>
      {buildable && (
        <div
          className={cn(
            'px-2.5 pb-2.5 pt-0.5 flex flex-col gap-2 border-t border-border-soft',
            depth % 2 === 0 ? 'bg-[rgba(0,0,0,0.25)]' : 'bg-[rgba(0,0,0,0.4)]',
          )}
        >
          {sortInputs(node.inputs, display).map((child, i) => (
            <NodeCard key={`${child.typeId}-${i}`} node={child} display={display} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NestedCards({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay } = structure;
  return (
    <div className="flex flex-col gap-2.5">
      {buildTree.map((root, i) => (
        <NodeCard key={i} node={root} display={buildNodeDisplay} depth={0} />
      ))}
    </div>
  );
}

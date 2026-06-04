import { Fragment } from 'react';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TypeIcon } from '@/components/ui/type-icon';
import type { BlueprintStructure, BuildNode } from '@/features/industry-planner/types';
import { formatNodeQty, sortInputs, type Display } from './tree-shared';

// Tree v1 — Indented Outline. A classic collapsible file-tree: each buildable
// node is a native <details> (no React state — the element owns open/closed,
// matching the Collapsible invariant), its inputs indented under a guide line.
// The chevron rotates via the global `details[open] [data-chevron]` rule.

function Row({ node, display }: { node: BuildNode; display: Display }) {
  const d = display[node.typeId];
  const buildable = !d.isRaw;
  return (
    <span className="flex items-center gap-2.5 min-w-0 flex-1">
      {buildable && (
        <span data-chevron className="text-[10px] text-muted transition-transform inline-block w-2">
          ▸
        </span>
      )}
      {!buildable && <span className="w-2 inline-block" aria-hidden />}
      <TypeIcon typeId={node.typeId} size={22} mono={d.name.slice(0, 2)} />
      <span className="truncate text-[12px] text-name">{d.name}</span>
      <Pill tone={d.tone}>{d.label}</Pill>
      <span className="ml-auto text-[11px] text-muted whitespace-nowrap">
        × {formatNodeQty(node.quantity)}
      </span>
    </span>
  );
}

function OutlineNode({ node, display, depth }: { node: BuildNode; display: Display; depth: number }) {
  const buildable = node.inputs.length > 0;
  if (!buildable) {
    return (
      <div className="flex items-center px-2.5 py-[6px] hover:bg-[rgba(255,255,255,0.018)]">
        <Row node={node} display={display} />
      </div>
    );
  }
  return (
    <details open={depth < 2} className="group">
      <summary className="flex items-center px-2.5 py-[6px] cursor-pointer select-none hover:bg-[rgba(255,255,255,0.025)] list-none [&::-webkit-details-marker]:hidden">
        <Row node={node} display={display} />
      </summary>
      <div className="ml-[20px] pl-3 border-l border-border-soft">
        {sortInputs(node.inputs, display).map((child, i) => (
          <OutlineNode key={`${child.typeId}-${i}`} node={child} display={display} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

export function IndentedOutline({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay } = structure;
  return (
    <div className={cn('font-mono text-[12px]')}>
      {buildTree.map((root, i) => (
        <Fragment key={i}>
          <OutlineNode node={root} display={buildNodeDisplay} depth={0} />
        </Fragment>
      ))}
    </div>
  );
}

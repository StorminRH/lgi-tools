import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { ResourceRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { formatQuantity } from '@/lib/format';
import type { BlueprintStructure } from '../types';

// Structural-only material breakdown. No price dependency, so it renders in the
// static shell while the cost panel streams in beside it. Reuses <Collapsible>
// (the wave-card group-of-entities pattern): an intermediate node — one that is
// itself built from sub-materials — is a collapsible group; a raw leaf is a
// plain row. Nesting indents via a per-level border, so there are no
// depth-keyed classes and no inline styles (CSP-safe).

// name + right-aligned quantity, the two columns every tree row shares.
const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto]';

function nameOf(names: Record<number, string>, typeId: number): string {
  return names[typeId] ?? `Type ${typeId}`;
}

function MaterialNode({
  node,
  names,
}: {
  node: TreeNode;
  names: Record<number, string>;
}) {
  const label = nameOf(names, node.typeId);
  const qty = `× ${formatQuantity(node.quantity)}`;

  if (node.inputs.length === 0) {
    return <ResourceRow colsClass={ROW_COLS} name={label} meta={qty} />;
  }

  return (
    <Collapsible
      header={
        <>
          <span className="flex items-center gap-[6px] text-name text-[12px] min-w-0">
            <span data-chevron className="text-[8px] text-muted leading-none">
              ▾
            </span>
            <span className="truncate">{label}</span>
          </span>
          <span className="ml-auto text-[10px] text-muted whitespace-nowrap">{qty}</span>
        </>
      }
    >
      <div className="ml-3.5 border-l border-border-soft">
        {node.inputs.map((child, i) => (
          <MaterialNode key={`${child.typeId}-${i}`} node={child} names={names} />
        ))}
      </div>
    </Collapsible>
  );
}

export function MaterialTree({ structure }: { structure: BlueprintStructure }) {
  const { tree, materialNames } = structure;
  return (
    <Card>
      <SectionHeader label="Material Tree" hint={tree.length > 0 ? 'tap to expand' : undefined} />
      {tree.length === 0 ? (
        <EmptyState>No material breakdown — this blueprint has no resolved inputs yet.</EmptyState>
      ) : (
        tree.map((node, i) => (
          <MaterialNode key={`${node.typeId}-${i}`} node={node} names={materialNames} />
        ))
      )}
    </Card>
  );
}

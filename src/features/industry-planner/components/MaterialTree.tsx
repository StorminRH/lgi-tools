import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { ResourceRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import type { Tone } from '@/components/ui/tones';
import { formatQuantity } from '@/lib/format';
import { toneDotClass } from '../industry-styles';
import type { BlueprintStructure, BuildNode, BuildNodeDisplay } from '../types';

// The build plan — the dependency tree rooted at the product, shown as a
// phased build sequence. Structure comes from graph height: the product sits
// above its components/reactions, which sit above the raws they consume. Every
// node's label is a real in-game identifier (reaction / SDE group / source),
// never an invented bucket. No price dependency, so it paints in the static
// shell.
//
// Depth is handled entirely by native <details>: steps within the reveal
// window open by default, deeper steps stay collapsed (their chevron signals
// there's more underneath), and a collapsed step hides its inputs — so a raw
// material surfaces only as the immediate input of a step you've opened.
const REVEAL_DEPTH = 2;

// name + right-aligned quantity.
const ROW_COLS = 'grid-cols-[minmax(0,1fr)_auto]';

// On the marginal basis a deep batch input's share of one end product can be
// sub-unit; show that as "< 1" rather than a rounded-down "0".
function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return formatQuantity(quantity);
}

function ToneDot({ tone }: { tone: Tone }) {
  return (
    <span className={cn('inline-block w-[6px] h-[6px] rounded-full shrink-0', toneDotClass(tone))} />
  );
}

function TreeNodeRow({
  node,
  display,
  depth,
}: {
  node: BuildNode;
  display: Record<number, BuildNodeDisplay>;
  depth: number;
}) {
  const d = display[node.typeId];
  const qty = `× ${formatNodeQty(node.quantity)}`;

  // A raw leaf — a terminal ingredient with no recipe to expand.
  if (d.isRaw) {
    return (
      <ResourceRow
        colsClass={ROW_COLS}
        name={
          <span className="flex items-center gap-2 min-w-0">
            <ToneDot tone={d.tone} />
            <span className="truncate">{d.name}</span>
          </span>
        }
        meta={qty}
      />
    );
  }

  // A buildable step — collapsible, auto-open within the reveal window.
  return (
    <Collapsible
      defaultOpen={depth < REVEAL_DEPTH}
      header={
        <>
          <span className="flex items-center gap-[6px] text-name text-[12px] min-w-0">
            <span data-chevron className="text-[8px] text-muted leading-none">
              ▾
            </span>
            <ToneDot tone={d.tone} />
            <span className="truncate">{d.name}</span>
            <span className="text-[9px] tracking-[0.08em] uppercase whitespace-nowrap text-muted">
              {d.label}
            </span>
          </span>
          <span className="text-[10px] text-muted whitespace-nowrap">{qty}</span>
        </>
      }
    >
      <div className="ml-3.5 border-l border-border-soft">
        {node.inputs.map((input) => (
          <TreeNodeRow
            key={input.typeId}
            node={input}
            display={display}
            depth={depth + 1}
          />
        ))}
      </div>
    </Collapsible>
  );
}

export function MaterialTree({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay } = structure;
  return (
    <Card>
      <SectionHeader
        label="Build Plan"
        hint={buildTree.length > 0 ? 'build sequence · tap a step to expand' : undefined}
      />
      {buildTree.length === 0 ? (
        <EmptyState>No build breakdown — this blueprint has no resolved inputs yet.</EmptyState>
      ) : (
        buildTree.map((node) => (
          <TreeNodeRow key={node.typeId} node={node} display={buildNodeDisplay} depth={0} />
        ))
      )}
    </Card>
  );
}

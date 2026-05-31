'use client';

import { Card } from '@/components/ui/card';
import { CascadingPanels, type CascadePane } from '@/components/ui/cascading-panels';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { SectionHeader } from '@/components/ui/section-header';
import { TypeIcon } from '@/components/ui/type-icon';
import { useCascadePath } from '@/components/ui/use-cascade-path';
import { formatQuantity } from '@/lib/format';
import type { BlueprintStructure, BuildNode, BuildNodeDisplay } from '../types';
import { usePricing } from './PricingProvider';

// The build plan as a floating-column cascade (the detail-page consumer of the
// CascadingPanels primitive — decision #2's refinement of #4). Column 0 is the
// product and its direct inputs; clicking a buildable input (▸) fans its own
// inputs out as a new floating column, walking the production chain. The open
// path lives in the URL (?build=…), so it's shareable and the back button
// steps back out. Structural only — no price dependency — so it paints in the
// static shell. 3.1.2 layers stacked blocks + per-row confidence on top.

type Display = Record<number, BuildNodeDisplay>;

// On a marginal basis a deep input's share of one end product can be sub-unit.
function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return formatQuantity(quantity);
}

const ROW =
  'grid grid-cols-[32px_minmax(0,1fr)_auto_auto_13px_16px] items-center gap-2.5 px-3.5 py-[7px] border-t border-border-soft first:border-t-0 text-[12px]';

function BuildRow({
  node,
  display,
  open,
  onToggle,
}: {
  node: BuildNode;
  display: Display;
  open: boolean;
  onToggle?: () => void;
}) {
  const { confidenceFor } = usePricing();
  const d = display[node.typeId];
  const buildable = !d.isRaw;
  const conf = confidenceFor(node.typeId);
  const inner = (
    <>
      <TypeIcon typeId={node.typeId} size={32} mono={d.name.slice(0, 2)} />
      <span className="truncate text-name">{d.name}</span>
      <span className="text-[9px] tracking-[0.08em] uppercase text-muted whitespace-nowrap">
        {d.label}
      </span>
      <span className="text-[11px] text-muted whitespace-nowrap">× {formatNodeQty(node.quantity)}</span>
      <span className="flex justify-center">
        {conf && <PriceConfidence level={conf.level} reasons={conf.reasons} />}
      </span>
      <span className={cn('text-[11px] text-center', open ? 'text-isk' : 'text-muted')}>
        {buildable ? '▸' : ''}
      </span>
    </>
  );

  if (!buildable || !onToggle) return <div className={ROW}>{inner}</div>;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        ROW,
        'w-full text-left cursor-pointer hover:bg-[rgba(255,255,255,0.018)]',
        open && 'bg-[rgba(61,214,140,0.06)] shadow-[inset_2px_0_0_var(--color-isk)]',
      )}
    >
      {inner}
    </button>
  );
}

// One node rendered as a block: its own header, then its inputs as rows. A
// row's drill toggles `path[paneIndex]` — the segment that opens this pane's
// child column.
function BuildBlock({
  node,
  display,
  paneIndex,
  path,
  setPath,
}: {
  node: BuildNode;
  display: Display;
  paneIndex: number;
  path: string[];
  setPath: (path: string[]) => void;
}) {
  const d = display[node.typeId];
  const toggle = (typeId: number) => {
    const key = String(typeId);
    if (path[paneIndex] === key) setPath(path.slice(0, paneIndex));
    else setPath([...path.slice(0, paneIndex), key]);
  };

  return (
    <Card>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border-soft bg-bg">
        <TypeIcon typeId={node.typeId} size={32} mono={d.name.slice(0, 2)} />
        <span className="font-display font-semibold text-[14px] text-name truncate">{d.name}</span>
        <Pill tone={d.tone}>{d.label}</Pill>
        <span className="ml-auto text-[10px] text-muted whitespace-nowrap">
          × {formatNodeQty(node.quantity)}
        </span>
      </div>
      {node.inputs.map((input) => {
        const buildable = !display[input.typeId].isRaw;
        return (
          <BuildRow
            key={input.typeId}
            node={input}
            display={display}
            open={path[paneIndex] === String(input.typeId)}
            onToggle={buildable ? () => toggle(input.typeId) : undefined}
          />
        );
      })}
    </Card>
  );
}

// The open drill path as a breadcrumb: the product, then each fanned-out
// column's component, URL-synced. Clicking a crumb collapses back to that
// depth. Mirrors the mockup's "Archon › … — drill path" line.
function DrillBreadcrumb({
  crumbs,
  setPath,
}: {
  crumbs: { key: string; name: string }[];
  setPath: (path: string[]) => void;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[10px] flex-wrap">
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={crumb.key} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted">›</span>}
            {last ? (
              <span className="text-name">{crumb.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => setPath(crumbs.slice(1, i + 1).map((c) => c.key))}
                className="text-muted hover:text-name cursor-pointer"
              >
                {crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function BuildCascade({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay: display } = structure;
  const [path, setPath] = useCascadePath('build');

  if (buildTree.length === 0) {
    return (
      <Card>
        <SectionHeader label="Build Plan" />
        <EmptyState>No build breakdown — this blueprint has no resolved inputs yet.</EmptyState>
      </Card>
    );
  }

  // The product anchors the breadcrumb; resolved drill segments append to it.
  const crumbs: { key: string; name: string }[] = [
    { key: 'root', name: display[buildTree[0].typeId]?.name ?? 'Build steps' },
  ];

  const panes: CascadePane[] = [
    {
      key: 'root',
      label: 'Build steps',
      content: (
        <div className="flex flex-col gap-3.5">
          {buildTree.map((root) => (
            <BuildBlock
              key={root.typeId}
              node={root}
              display={display}
              paneIndex={0}
              path={path}
              setPath={setPath}
            />
          ))}
        </div>
      ),
    },
  ];

  // Walk the open path: each segment resolves to a buildable input of the
  // previous column, whose own inputs become the next column. A stale segment
  // (the tree changed under a shared URL) just stops the walk.
  let inputs = buildTree.flatMap((root) => root.inputs);
  for (let p = 0; p < path.length; p += 1) {
    const node = inputs.find(
      (n) => String(n.typeId) === path[p] && !display[n.typeId].isRaw,
    );
    if (!node) break;
    crumbs.push({ key: String(node.typeId), name: display[node.typeId].name });
    panes.push({
      key: String(node.typeId),
      label: display[node.typeId].name,
      content: (
        <BuildBlock
          node={node}
          display={display}
          paneIndex={p + 1}
          path={path}
          setPath={setPath}
        />
      ),
    });
    inputs = node.inputs;
  }

  return (
    <div className="mb-4">
      <DrillBreadcrumb crumbs={crumbs} setPath={setPath} />
      <CascadingPanels panes={panes} />
    </div>
  );
}

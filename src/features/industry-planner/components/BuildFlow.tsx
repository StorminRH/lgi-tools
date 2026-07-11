'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cn } from '@/components/ui/cn';
import { toneHex } from '@/components/ui/tones';
import { consolidateBuild, type ConsolidatedTier } from '../build-consolidate';
import {
  breadcrumbText,
  buildLevel,
  chainTo,
  columnNodeInteract,
  findPath,
  fit,
  flowNodeInteract,
  flowNodeLayout,
  focusOf,
  formatNodeQty,
  inLayerClass,
  layerKey,
  layoutTier,
  naturalHeightFor,
  outLayerClass,
  pickDepth,
  trunc,
  truncTo,
  type ColRow,
  type Display,
  type Laid,
  ICON,
  NODE_H,
  NODE_W,
  COL_W,
  TEXT_X,
  TRANS_MS,
} from '../build-tree-layout';
import type { BlueprintStructure, BuildNode } from '../types';

// The build plan as a hybrid graph. The overview is the consolidated build tiers
// drawn as columns (no connector lines, no product block — same by-depth grouping
// as ConsolidatedBuild). Clicking a buildable part cross-fades+zooms into the
// traditional flow graph of just that part (curved connector lines, fanned-out
// children); a breadcrumb walks back out. The view draws at its natural height,
// centred on the page, and never scrolls horizontally — real capital trees are
// thousands of nodes, so only one focus level is shown at a time (you drill to
// go deeper). All layout math lives in build-tree-layout.ts; this component is
// pure SVG presentation + the measure/drill/transition state.

// A category sub-header inside an overview column: the group label over a
// tone-coloured rule spanning the box width. Items below it drop their inline
// label, so the long category name no longer clips inside each box.
function GroupHeader({ y, label, tone }: { y: number; label: string; tone: string }) {
  return (
    <g transform={`translate(0, ${y})`}>
      <text x={2} y={9} fill={tone} fontSize={9} fontWeight={600} letterSpacing={0.8}>
        {truncTo(label.toUpperCase(), 34)}
      </text>
      <line x1={0} y1={15} x2={NODE_W} y2={15} stroke={tone} strokeOpacity={0.35} strokeWidth={1} />
    </g>
  );
}

// One node box: tone stripe, type icon, name, quantity, and an optional
// right-edge indicator (▸ to drill in, ‹ back to step out of a drilled level).
// `label` (the SDE category) is shown as a second line in the drilled graph,
// where there's no grouping; the overview omits it (the GroupHeader carries it)
// and centres the single line. Pure SVG presentation attributes + an <image>
// from the EVE image server (allowed by img-src) — no inline styles, CSP-safe.
// The right-edge affordance: ▸ to drill into a node, or ‹ back to step out.
function FlowIndicator({ indicator, tone }: { indicator: 'drill' | 'back'; tone: string }) {
  if (indicator === 'drill') {
    return (
      <text x={NODE_W - 9} y={NODE_H - 3} fill={tone} fontSize={8} textAnchor="end">
        ▸
      </text>
    );
  }
  return (
    <text x={NODE_W - 9} y={NODE_H - 3} className="fill-muted" fontSize={8} textAnchor="end">
      ‹ back
    </text>
  );
}

function FlowNodeBox({
  typeId,
  name,
  label,
  tone,
  quantity,
  indicator,
}: {
  typeId: number;
  name: string;
  label?: string;
  tone: string;
  quantity: number;
  indicator?: 'drill' | 'back';
}) {
  const { hasLabel, nameY, qtyY } = flowNodeLayout(label);
  return (
    <>
      <rect width={NODE_W} height={NODE_H} rx={3} className="fill-bg stroke-border" />
      <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
      <image
        href={`https://images.evetech.net/types/${typeId}/icon?size=64`}
        x={7}
        y={(NODE_H - ICON) / 2}
        width={ICON}
        height={ICON}
        preserveAspectRatio="xMidYMid meet"
      />
      <text x={TEXT_X} y={nameY} className="fill-name" fontSize={11}>
        {trunc(name)}
      </text>
      {hasLabel && label && (
        <text x={TEXT_X} y={24} fill={tone} fontSize={8} letterSpacing={0.4}>
          {truncTo(label.toUpperCase(), 26)}
        </text>
      )}
      <text x={NODE_W - 9} y={qtyY} className="fill-muted" fontSize={10} textAnchor="end">
        ×{formatNodeQty(quantity)}
      </text>
      {indicator && <FlowIndicator indicator={indicator} tone={tone} />}
    </>
  );
}

function FlowLevel({
  root,
  display,
  width,
  onDrill,
  onBackOut,
}: {
  root: BuildNode;
  display: Display;
  width: number;
  onDrill: (chain: number[]) => void;
  // Set when this level is drilled in: clicking the focused root box steps back.
  onBackOut?: () => void;
}) {
  const { nodes, contentW } = useMemo(() => buildLevel(root, display, pickDepth(root)), [root, display]);
  const { s, tx } = fit(width, contentW);
  return (
    <g transform={`translate(${tx.toFixed(2)} 0) scale(${s.toFixed(4)})`}>
      {nodes.map((n, i) => {
        if (!n.parent) return null;
        const sx = n.parent.x + NODE_W;
        const mx = (sx + n.x) / 2;
        return (
          <path
            key={`e-${i}`}
            d={`M ${sx} ${n.parent.y} C ${mx} ${n.parent.y}, ${mx} ${n.y}, ${n.x} ${n.y}`}
            fill="none"
            stroke={toneHex[display[n.node.typeId].tone]}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        );
      })}
      {nodes.map((n, i) => (
        <FlowNode key={`n-${i}`} laid={n} display={display} onDrill={onDrill} onBackOut={onBackOut} />
      ))}
    </g>
  );
}

// One drilled node: its box plus the click/indicator wiring decided by
// flowNodeInteract (the focused root steps out, deeper nodes drill in).
function FlowNode({
  laid,
  display,
  onDrill,
  onBackOut,
}: {
  laid: Laid;
  display: Display;
  onDrill: (chain: number[]) => void;
  onBackOut?: () => void;
}) {
  const d = display[laid.node.typeId];
  const it = flowNodeInteract(laid, !!onBackOut);
  const onClick =
    it.action === 'back' ? onBackOut : it.action === 'drill' ? () => onDrill(chainTo(laid)) : undefined;
  return (
    <g transform={`translate(${laid.x}, ${laid.y - NODE_H / 2})`} className={it.className} onClick={onClick}>
      <FlowNodeBox
        typeId={laid.node.typeId}
        name={d.name}
        label={d.label}
        tone={toneHex[d.tone]}
        quantity={laid.node.quantity}
        indicator={it.indicator}
      />
    </g>
  );
}

// One overview-column row: a category header band, or an item node whose
// drill affordance comes from columnNodeInteract.
function ColumnNode({ row, onPick }: { row: ColRow; onPick?: (typeId: number) => void }) {
  if (row.kind === 'header') {
    return <GroupHeader y={row.y} label={row.label!} tone={row.tone!} />;
  }
  const it = row.item!;
  const ci = columnNodeInteract(it.hasChildren, onPick !== undefined);
  return (
    <g
      transform={`translate(0, ${row.y})`}
      className={ci.className}
      onClick={ci.clickable && onPick ? () => onPick(it.typeId) : undefined}
    >
      <FlowNodeBox
        typeId={it.typeId}
        name={it.name}
        tone={toneHex[it.tone]}
        quantity={it.quantity}
        indicator={ci.indicator}
      />
    </g>
  );
}

function FlowColumns({
  tiers,
  width,
  onPick,
}: {
  tiers: ConsolidatedTier[];
  width: number;
  onPick?: (typeId: number) => void;
}) {
  const contentW = Math.max(1, tiers.length) * COL_W;
  const { s, tx } = fit(width, contentW);
  return (
    <g transform={`translate(${tx.toFixed(2)} 0) scale(${s.toFixed(4)})`}>
      {tiers.map((tier, c) => (
        <g key={tier.depth} transform={`translate(${c * COL_W}, 0)`}>
          <text x={3} y={11} className="fill-muted" fontSize={9} letterSpacing={1.2}>
            TIER {tier.depth}
          </text>
          {layoutTier(tier.items).rows.map((r, i) => (
            <ColumnNode key={i} row={r} onPick={onPick} />
          ))}
        </g>
      ))}
    </g>
  );
}

// The root overview (consolidated tier columns); picking a part drills in.
function ColumnsView({
  tiers,
  width,
  interactive,
  buildTree,
  onGo,
}: {
  tiers: ConsolidatedTier[];
  width: number;
  interactive: boolean;
  buildTree: BuildNode[];
  onGo: (next: number[], dir: 'in' | 'out') => void;
}) {
  return (
    <FlowColumns
      tiers={tiers}
      width={width}
      onPick={interactive ? (t) => onGo(findPath(buildTree, t) ?? [t], 'in') : undefined}
    />
  );
}

// A drilled focus level (curved connectors); drilling deepens, back steps out.
function LevelView({
  path,
  display,
  width,
  interactive,
  buildTree,
  onGo,
}: {
  path: number[];
  display: Display;
  width: number;
  interactive: boolean;
  buildTree: BuildNode[];
  onGo: (next: number[], dir: 'in' | 'out') => void;
}) {
  return (
    <FlowLevel
      root={focusOf(buildTree, display, path)}
      display={display}
      width={width}
      onDrill={interactive ? (chain) => onGo([...path, ...chain], 'in') : () => {}}
      onBackOut={interactive ? () => onGo(path.slice(0, -1), 'out') : undefined}
    />
  );
}

// A transition step: the cross-fade to a new focus path. `trans` holds the
// outgoing path + direction until the timer clears it; `go` swaps the path and
// arms that timer (cancelling any pending one, and on unmount).
type FlowTransition = { prevPath: number[]; dir: 'in' | 'out' } | null;
interface FlowDrill {
  path: number[];
  trans: FlowTransition;
  go: (next: number[], dir: 'in' | 'out') => void;
}
function useFlowDrill(): FlowDrill {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [trans, setTrans] = useState<FlowTransition>(null);
  // Cancel a pending transition timer if the component unmounts mid-animation.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  const go = (next: number[], dir: 'in' | 'out') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTrans({ prevPath: path, dir });
    setPath(next);
    timerRef.current = setTimeout(() => setTrans(null), TRANS_MS);
  };
  return { path, trans, go };
}

// The element's measured pixel width, or null before the first ResizeObserver
// tick. A plain effect: the SVG is gated on `width &&`, so it never paints before
// the first measure — no pre-paint synchronous read that would justify
// useLayoutEffect (which also warns when this streams from a server component).
function useMeasuredWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// The graph for a focus path: the root overview columns, or a drilled focus
// level. Nothing before the first measure (width null).
function FlowRender({
  path,
  interactive,
  width,
  tiers,
  display,
  buildTree,
  onGo,
}: {
  path: number[];
  interactive: boolean;
  width: number | null;
  tiers: ConsolidatedTier[];
  display: Display;
  buildTree: BuildNode[];
  onGo: (next: number[], dir: 'in' | 'out') => void;
}) {
  if (!width) return null;
  if (path.length === 0) {
    return <ColumnsView tiers={tiers} width={width} interactive={interactive} buildTree={buildTree} onGo={onGo} />;
  }
  return (
    <LevelView
      path={path}
      display={display}
      width={width}
      interactive={interactive}
      buildTree={buildTree}
      onGo={onGo}
    />
  );
}

export function BuildFlow({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay: display } = structure;
  const tiers = useMemo(() => consolidateBuild(structure).tiers, [structure]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(wrapRef);
  const { path, trans, go } = useFlowDrill();

  const naturalHeight = (p: number[]): number => naturalHeightFor(p, tiers, buildTree, display, width);
  const viewH = trans ? Math.max(naturalHeight(path), naturalHeight(trans.prevPath)) : naturalHeight(path);
  const common = { width, tiers, display, buildTree, onGo: go };

  return (
    <div>
      <div className="mb-2.5 text-[9px] tracking-[0.1em] uppercase text-muted min-h-[18px]">
        {breadcrumbText(path)}
      </div>

      <div ref={wrapRef} className="w-full">
        {width && (
          <svg
            width={width}
            height={viewH}
            viewBox={`0 0 ${width} ${viewH}`}
            className="font-mono block"
            role="img"
            aria-label="Build plan flow graph"
          >
            {trans && (
              <g key={`out-${layerKey(trans.prevPath)}`} className={cn('flow-layer', outLayerClass(trans.dir))}>
                <FlowRender path={trans.prevPath} interactive={false} {...common} />
              </g>
            )}
            <g key={`in-${layerKey(path)}`} className={cn('flow-layer', inLayerClass(trans))}>
              <FlowRender path={path} interactive={true} {...common} />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

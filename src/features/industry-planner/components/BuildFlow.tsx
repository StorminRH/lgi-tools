'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { toneHex } from '@/components/ui/tones';
import { formatQuantity } from '@/lib/format';
import { consolidateBuild, type ConsolidatedItem, type ConsolidatedTier } from '../build-consolidate';
import type { BlueprintStructure, BuildNode, BuildNodeDisplay } from '../types';

// The build plan as a hybrid graph. The overview is the consolidated build tiers
// drawn as columns (no connector lines, no product block — same by-depth grouping
// as ConsolidatedBuild). Clicking a buildable part cross-fades+zooms into the
// traditional flow graph of just that part (curved connector lines, fanned-out
// children); a breadcrumb walks back out. The view draws at its natural height,
// centred on the page, and never scrolls horizontally — real capital trees are
// thousands of nodes, so only one focus level is shown at a time (you drill to
// go deeper). Pure SVG presentation attributes + class-driven keyframes — no
// inline styles, CSP-safe.

type Display = Record<number, BuildNodeDisplay>;

const COL = 210;
const NODE_W = 184;
const NODE_H = 32;
const ROW = 46;
const PAD = 22;
const COL_W = 212;
const HEADER_H = 28;
const MAX_NODES = 46; // per-level node budget; deeper/wider trees show fewer levels
const TRANS_MS = 440;
const MAX_SCALE = 1.75; // scale columns UP to fill the width, but not past this
const ICON = 20; // type-icon square inside a node box
const TEXT_X = 32; // node text x-offset, leaving room for the icon
const GROUP_H = 22; // category sub-header band (label + rule) in the overview columns
const GROUP_GAP = 8; // gap below a category group before the next one

function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return formatQuantity(quantity);
}

function sortInputs(inputs: BuildNode[], display: Display): BuildNode[] {
  return [...inputs].sort((a, b) => {
    const da = display[a.typeId];
    const db = display[b.typeId];
    return (
      Number(da.isRaw) - Number(db.isRaw) ||
      da.label.localeCompare(db.label) ||
      da.name.localeCompare(db.name)
    );
  });
}

interface Laid {
  node: BuildNode;
  depth: number;
  x: number;
  y: number;
  parent: Laid | null;
  children: Laid[];
}

function countWithin(node: BuildNode, maxDepth: number): number {
  if (maxDepth <= 0) return 1;
  let c = 1;
  for (const k of node.inputs) c += countWithin(k, maxDepth - 1);
  return c;
}

function pickDepth(root: BuildNode): number {
  for (const d of [2, 1]) {
    if (countWithin(root, d) <= MAX_NODES) return d;
  }
  return 1;
}

function buildLevel(root: BuildNode, display: Display, maxDepth: number) {
  const round = (v: number) => Math.round(v * 100) / 100;
  const nodes: Laid[] = [];
  let leaf = 0;
  let deepest = 0;
  const place = (node: BuildNode, depth: number, parent: Laid | null): Laid => {
    deepest = Math.max(deepest, depth);
    const laid: Laid = { node, depth, x: round(depth * COL), y: 0, parent, children: [] };
    const kids = sortInputs(node.inputs, display);
    if (depth >= maxDepth || kids.length === 0) {
      laid.y = round(PAD + leaf * ROW + NODE_H / 2);
      leaf += 1;
    } else {
      laid.children = kids.map((k) => place(k, depth + 1, laid));
      laid.y = round((laid.children[0].y + laid.children[laid.children.length - 1].y) / 2);
    }
    nodes.push(laid);
    return laid;
  };
  place(root, 0, null);
  return { nodes, contentW: deepest * COL + NODE_W, contentH: PAD * 2 + Math.max(1, leaf) * ROW };
}

function chainTo(laid: Laid): number[] {
  const chain: number[] = [];
  let cur: Laid | null = laid;
  while (cur && cur.parent) {
    chain.unshift(cur.node.typeId);
    cur = cur.parent;
  }
  return chain;
}

function focusOf(tree: BuildNode[], display: Display, path: number[]): BuildNode {
  let node = tree[0];
  for (const id of path) {
    const next = node.inputs.find((n) => n.typeId === id && !display[n.typeId].isRaw && n.inputs.length > 0);
    if (!next) break;
    node = next;
  }
  return node;
}

function findPath(tree: BuildNode[], typeId: number): number[] | null {
  const dfs = (node: BuildNode, acc: number[]): number[] | null => {
    for (const c of node.inputs) {
      const next = [...acc, c.typeId];
      if (c.typeId === typeId) return next;
      const r = dfs(c, next);
      if (r) return r;
    }
    return null;
  };
  return dfs(tree[0], []);
}

function trunc(name: string): string {
  const maxChars = Math.max(6, Math.floor((NODE_W - TEXT_X - 36) / 6.2));
  return name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
}

// Truncate a category label to a char budget (SVG text has no auto-ellipsis).
function truncTo(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

// Contiguous category groups within a tier column. Items arrive pre-sorted by
// label (see consolidateBuild), so a single pass yields one block per category.
function tierGroups(items: ConsolidatedItem[]): { label: string; tone: string; items: ConsolidatedItem[] }[] {
  const groups: { label: string; tone: string; items: ConsolidatedItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === it.label) last.items.push(it);
    else groups.push({ label: it.label, tone: toneHex[it.tone], items: [it] });
  }
  return groups;
}

interface ColRow {
  kind: 'header' | 'item';
  y: number;
  label?: string;
  tone?: string;
  item?: ConsolidatedItem;
}

// Lay a tier column out as stacked category sub-blocks: a header band (label +
// rule) followed by its item rows, then a gap before the next category. Returns
// the positioned rows and the total column height (shared with naturalHeight).
function layoutTier(items: ConsolidatedItem[]): { rows: ColRow[]; height: number } {
  const rows: ColRow[] = [];
  let y = HEADER_H;
  for (const g of tierGroups(items)) {
    rows.push({ kind: 'header', y, label: g.label, tone: g.tone });
    y += GROUP_H;
    for (const item of g.items) {
      rows.push({ kind: 'item', y, item });
      y += ROW;
    }
    y += GROUP_GAP;
  }
  return { rows, height: y - GROUP_GAP + PAD };
}

// Scale `contentW` to fill the measured width (up to MAX_SCALE) and centre it,
// so the columns fill the space under the hero header; with more columns than
// fit, the scale drops below 1 and they shrink to fit instead.
function fit(width: number, contentW: number): { s: number; tx: number } {
  const s = Math.min(width / contentW, MAX_SCALE);
  return { s, tx: (width - s * contentW) / 2 };
}

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
  const hasLabel = !!label;
  const nameY = hasLabel ? 13 : 20;
  const qtyY = hasLabel ? 19 : 20;
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
      {hasLabel && (
        <text x={TEXT_X} y={24} fill={tone} fontSize={8} letterSpacing={0.4}>
          {truncTo(label.toUpperCase(), 26)}
        </text>
      )}
      <text x={NODE_W - 9} y={qtyY} className="fill-muted" fontSize={10} textAnchor="end">
        ×{formatNodeQty(quantity)}
      </text>
      {indicator === 'drill' && (
        <text x={NODE_W - 9} y={NODE_H - 3} fill={tone} fontSize={8} textAnchor="end">
          ▸
        </text>
      )}
      {indicator === 'back' && (
        <text x={NODE_W - 9} y={NODE_H - 3} className="fill-muted" fontSize={8} textAnchor="end">
          ‹ back
        </text>
      )}
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
      {nodes.map((n, i) => {
        const d = display[n.node.typeId];
        const tone = toneHex[d.tone];
        const isRoot = !n.parent;
        const canBack = isRoot && !!onBackOut;
        const drillable = n.depth > 0 && n.node.inputs.length > 0;
        const clickable = canBack || drillable;
        return (
          <g
            key={`n-${i}`}
            transform={`translate(${n.x}, ${n.y - NODE_H / 2})`}
            className={clickable ? 'flow-node' : undefined}
            onClick={canBack ? onBackOut : drillable ? () => onDrill(chainTo(n)) : undefined}
          >
            <FlowNodeBox
              typeId={n.node.typeId}
              name={d.name}
              label={d.label}
              tone={tone}
              quantity={n.node.quantity}
              indicator={canBack ? 'back' : drillable ? 'drill' : undefined}
            />
          </g>
        );
      })}
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
          {layoutTier(tier.items).rows.map((r, i) => {
            if (r.kind === 'header') {
              return <GroupHeader key={`h-${i}`} y={r.y} label={r.label!} tone={r.tone!} />;
            }
            const it = r.item!;
            const drillable = it.hasChildren;
            return (
              <g
                key={it.typeId}
                transform={`translate(0, ${r.y})`}
                className={drillable ? 'flow-node' : undefined}
                onClick={drillable && onPick ? () => onPick(it.typeId) : undefined}
              >
                <FlowNodeBox
                  typeId={it.typeId}
                  name={it.name}
                  tone={toneHex[it.tone]}
                  quantity={it.quantity}
                  indicator={drillable ? 'drill' : undefined}
                />
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

export function BuildFlow({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay: display } = structure;
  const tiers = useMemo(() => consolidateBuild(structure).tiers, [structure]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [trans, setTrans] = useState<{ prevPath: number[]; dir: 'in' | 'out' } | null>(null);

  // Plain effect: the SVG is gated on `width &&`, so it never paints before
  // the first measure — there's no pre-paint synchronous read that would
  // justify useLayoutEffect (which also warns when this streams from a server
  // component).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const naturalHeight = (p: number[]): number => {
    if (!width) return 0;
    let cw: number;
    let ch: number;
    if (p.length === 0) {
      cw = Math.max(1, tiers.length) * COL_W;
      ch = Math.max(1, ...tiers.map((t) => layoutTier(t.items).height));
    } else {
      const f = focusOf(buildTree, display, p);
      const lvl = buildLevel(f, display, pickDepth(f));
      cw = lvl.contentW;
      ch = lvl.contentH;
    }
    return Math.round(ch * Math.min(width / cw, MAX_SCALE)) + 6;
  };
  const viewH = trans ? Math.max(naturalHeight(path), naturalHeight(trans.prevPath)) : naturalHeight(path);

  const renderFor = (p: number[], interactive: boolean) => {
    if (!width) return null;
    if (p.length === 0) {
      return (
        <FlowColumns
          tiers={tiers}
          width={width}
          onPick={interactive ? (t) => go(findPath(buildTree, t) ?? [t], 'in') : undefined}
        />
      );
    }
    return (
      <FlowLevel
        root={focusOf(buildTree, display, p)}
        display={display}
        width={width}
        onDrill={interactive ? (chain) => go([...p, ...chain], 'in') : () => {}}
        onBackOut={interactive ? () => go(p.slice(0, -1), 'out') : undefined}
      />
    );
  };

  return (
    <div>
      <div className="mb-2.5 text-[9px] tracking-[0.1em] uppercase text-muted min-h-[18px]">
        {path.length > 0
          ? 'click ‹ back to step out · click a part for its flow'
          : 'tiers · click a part for its flow'}
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
              <g
                key={`out-${trans.prevPath.join('-') || 'root'}`}
                className={cn('flow-layer', trans.dir === 'in' ? 'flow-recede' : 'flow-shrink-out')}
              >
                {renderFor(trans.prevPath, false)}
              </g>
            )}
            <g
              key={`in-${path.join('-') || 'root'}`}
              className={cn('flow-layer', trans?.dir === 'out' ? 'flow-shrink-in' : trans ? 'flow-grow' : '')}
            >
              {renderFor(path, true)}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import type { BlueprintStructure, BuildNode } from '@/features/industry-planner/types';
import { formatNodeQty, sortInputs, TONE_HEX, type Display } from './tree-shared';

// Tree v3 — Flow Connectors. A left-to-right node graph, pure SVG (every
// position/colour is a presentation attribute, never an inline `style`).
//
// Real build trees can be thousands of nodes (a capital is ~1300), so the graph
// shows ONE focus level at a time — a node plus its connections, expanded a level
// or two deeper when that still fits. Clicking a buildable node drills into it; a
// breadcrumb walks back out. The transition is a crossfade-zoom inside a
// fixed-height viewport: the outgoing level scales past and fades while the new
// one grows in — continuous motion, no delete-and-snap. Fits the page width.

const COL = 210;
const NODE_W = 184;
const NODE_H = 32;
const ROW = 46;
const PAD = 22;
const VIEW_H = 500;
const MAX_NODES = 46; // budget per level view; deeper/wider trees show fewer levels
const MAX_ZOOM = 1.35;
const TRANS_MS = 440;

interface Laid {
  node: BuildNode;
  depth: number;
  x: number;
  y: number;
  parent: Laid | null;
  children: Laid[];
  hasMore: boolean; // has inputs below the shown depth — still drillable
}

// Count nodes within `maxDepth` levels (cheap — bounded traversal, never the
// whole tree) so we can pick the deepest level that fits the node budget.
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

// Tidy layout of `root` and its descendants down to `maxDepth`.
function buildLevel(root: BuildNode, display: Display, maxDepth: number) {
  const round = (v: number) => Math.round(v * 100) / 100;
  const nodes: Laid[] = [];
  let leaf = 0;
  let deepest = 0;

  const place = (node: BuildNode, depth: number, parent: Laid | null): Laid => {
    deepest = Math.max(deepest, depth);
    const laid: Laid = { node, depth, x: round(depth * COL), y: 0, parent, children: [], hasMore: false };
    const kids = sortInputs(node.inputs, display);
    if (depth >= maxDepth || kids.length === 0) {
      laid.hasMore = depth >= maxDepth && kids.length > 0;
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
  const contentW = deepest * COL + NODE_W;
  const contentH = PAD * 2 + Math.max(1, leaf) * ROW;
  return { nodes, contentW, contentH };
}

// The path of typeIds from the level root down to a clicked node.
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

function Level({
  root,
  display,
  width,
  onDrill,
}: {
  root: BuildNode;
  display: Display;
  width: number;
  onDrill: (chain: number[], node: Laid) => void;
}) {
  const { nodes, contentW, contentH } = useMemo(
    () => buildLevel(root, display, pickDepth(root)),
    [root, display],
  );
  const s = Math.min((width - 12) / contentW, (VIEW_H - 12) / contentH, MAX_ZOOM);
  const tx = (width - s * contentW) / 2;
  const ty = (VIEW_H - s * contentH) / 2;

  return (
    <g transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`}>
      {nodes.map((n, i) => {
        if (!n.parent) return null;
        const sx = n.parent.x + NODE_W;
        const sy = n.parent.y;
        const mx = (sx + n.x) / 2;
        return (
          <path
            key={`e-${i}`}
            d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${n.y}, ${n.x} ${n.y}`}
            fill="none"
            stroke={TONE_HEX[display[n.node.typeId].tone]}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        );
      })}
      {nodes.map((n, i) => {
        const d = display[n.node.typeId];
        const tone = TONE_HEX[d.tone];
        const drillable = n.depth > 0 && n.node.inputs.length > 0;
        const maxChars = Math.max(6, Math.floor((NODE_W - 26) / 6.2));
        const label = d.name.length > maxChars ? `${d.name.slice(0, maxChars - 1)}…` : d.name;
        return (
          <g
            key={`n-${i}`}
            transform={`translate(${n.x}, ${n.y - NODE_H / 2})`}
            className={drillable ? 'sbx-flow-node' : undefined}
            onClick={drillable ? () => onDrill(chainTo(n), n) : undefined}
          >
            <rect width={NODE_W} height={NODE_H} rx={3} fill="#0d0f14" stroke="#1e2535" />
            <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
            <text x={12} y={13} fill="#dce8f0" fontSize={11}>
              {label}
            </text>
            <text x={12} y={24} fill={tone} fontSize={8} letterSpacing={0.4}>
              {d.label.toUpperCase()}
            </text>
            <text x={NODE_W - 9} y={19} fill="#6a7a8a" fontSize={10} textAnchor="end">
              ×{formatNodeQty(n.node.quantity)}
            </text>
            {drillable && (
              <text x={NODE_W - 9} y={NODE_H - 3} fill={tone} fontSize={8} textAnchor="end">
                ▸
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// --- Consolidated tier columns (the overview) ----------------------------
// Group every node by its DEPTH below the product (depth 1 = the product's
// direct inputs), summing quantities per type within a tier — the same
// "consolidated by depth" idea as the live planner. The product itself (depth 0)
// is omitted. Each tier becomes a column.
const COL_W = 212;
const HEADER_H = 28;

interface Tier {
  depth: number;
  items: { typeId: number; quantity: number; hasChildren: boolean }[];
}

function consolidate(tree: BuildNode[], display: Display): Tier[] {
  const byDepth = new Map<number, Map<number, { quantity: number; hasChildren: boolean }>>();
  const walk = (node: BuildNode, depth: number) => {
    if (depth >= 1) {
      let tier = byDepth.get(depth);
      if (!tier) {
        tier = new Map();
        byDepth.set(depth, tier);
      }
      const ex = tier.get(node.typeId);
      if (ex) ex.quantity += node.quantity;
      else tier.set(node.typeId, { quantity: node.quantity, hasChildren: node.inputs.length > 0 });
    }
    node.inputs.forEach((c) => walk(c, depth + 1));
  };
  tree[0].inputs.forEach((c) => walk(c, 1));
  return [...byDepth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([depth, m]) => ({
      depth,
      items: [...m.entries()]
        .map(([typeId, v]) => ({ typeId, ...v }))
        .sort((a, b) => {
          const da = display[a.typeId];
          const db = display[b.typeId];
          return (
            Number(da.isRaw) - Number(db.isRaw) ||
            da.label.localeCompare(db.label) ||
            da.name.localeCompare(db.name)
          );
        }),
    }));
}

// The root-down typeId chain to the first occurrence of a type (so picking a
// consolidated item can focus the flow view on that part's sub-build).
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

function ColumnsView({
  tiers,
  display,
  width,
  onPick,
}: {
  tiers: Tier[];
  display: Display;
  width: number;
  onPick?: (typeId: number) => void;
}) {
  const maxItems = Math.max(1, ...tiers.map((t) => t.items.length));
  const contentW = Math.max(1, tiers.length) * COL_W;
  const contentH = HEADER_H + maxItems * ROW + PAD;
  const s = Math.min((width - 12) / contentW, (VIEW_H - 12) / contentH, MAX_ZOOM);
  const tx = (width - s * contentW) / 2;
  const ty = (VIEW_H - s * contentH) / 2;
  const maxChars = Math.max(6, Math.floor((NODE_W - 26) / 6.2));

  return (
    <g transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`}>
      {tiers.map((tier, c) => (
        <g key={tier.depth} transform={`translate(${c * COL_W}, 0)`}>
          <text x={3} y={11} fill="#6a7a8a" fontSize={9} letterSpacing={1.2}>
            TIER {tier.depth}
          </text>
          {tier.items.map((it, j) => {
            const d = display[it.typeId];
            const tone = TONE_HEX[d.tone];
            const drillable = it.hasChildren;
            const label = d.name.length > maxChars ? `${d.name.slice(0, maxChars - 1)}…` : d.name;
            return (
              <g
                key={it.typeId}
                transform={`translate(0, ${HEADER_H + j * ROW})`}
                className={drillable ? 'sbx-flow-node' : undefined}
                onClick={drillable && onPick ? () => onPick(it.typeId) : undefined}
              >
                <rect width={NODE_W} height={NODE_H} rx={3} fill="#0d0f14" stroke="#1e2535" />
                <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
                <text x={12} y={13} fill="#dce8f0" fontSize={11}>
                  {label}
                </text>
                <text x={12} y={24} fill={tone} fontSize={8} letterSpacing={0.4}>
                  {d.label.toUpperCase()}
                </text>
                <text x={NODE_W - 9} y={19} fill="#6a7a8a" fontSize={10} textAnchor="end">
                  ×{formatNodeQty(it.quantity)}
                </text>
                {drillable && (
                  <text x={NODE_W - 9} y={NODE_H - 3} fill={tone} fontSize={8} textAnchor="end">
                    ▸
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

export function FlowConnectors({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay: display } = structure;
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [trans, setTrans] = useState<{ prevPath: number[]; dir: 'in' | 'out' } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (next: number[], dir: 'in' | 'out') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTrans({ prevPath: path, dir });
    setPath(next);
    timerRef.current = setTimeout(() => setTrans(null), TRANS_MS);
  };

  const tiers = useMemo(() => consolidate(buildTree, display), [buildTree, display]);

  // Path empty → the consolidated tier columns (overview, no lines/root). Path
  // set → the flow graph of the focused part (with connector lines).
  const renderFor = (p: number[], interactive: boolean) => {
    if (!width) return null;
    if (p.length === 0) {
      return (
        <ColumnsView
          tiers={tiers}
          display={display}
          width={width}
          onPick={interactive ? (t) => go(findPath(buildTree, t) ?? [t], 'in') : undefined}
        />
      );
    }
    return (
      <Level
        root={focusOf(buildTree, display, p)}
        display={display}
        width={width}
        onDrill={interactive ? (chain) => go([...p, ...chain], 'in') : () => {}}
      />
    );
  };

  // Breadcrumb: product root + each drilled node.
  const crumbs = [{ id: buildTree[0].typeId, name: display[buildTree[0].typeId].name }];
  {
    let node = buildTree[0];
    for (const id of path) {
      const next = node.inputs.find((n) => n.typeId === id);
      if (!next) break;
      crumbs.push({ id, name: display[id].name });
      node = next;
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[10px] flex-wrap min-h-[18px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={`${c.id}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted">›</span>}
              {last ? (
                <span className="text-name">{c.name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => go(path.slice(0, i), 'out')}
                  className="text-muted hover:text-name cursor-pointer"
                >
                  {c.name}
                </button>
              )}
            </span>
          );
        })}
        {path.length > 0 ? (
          <span className="ml-1 text-[9px] tracking-[0.1em] uppercase text-isk-sub">
            zoomed · click a crumb to back out
          </span>
        ) : (
          <span className="ml-1 text-[9px] tracking-[0.1em] uppercase text-muted">
            consolidated tiers · click a part for its flow
          </span>
        )}
      </div>

      <div ref={wrapRef} className="w-full">
        {width && (
          <svg
            width={width}
            height={VIEW_H}
            viewBox={`0 0 ${width} ${VIEW_H}`}
            className="font-mono block"
            role="img"
            aria-label="Blueprint build tree as a flow graph"
          >
            {trans && (
              <g
                key={`out-${trans.prevPath.join('-') || 'root'}`}
                className={cn('sbx-flow-layer', trans.dir === 'in' ? 'sbx-flow-recede' : 'sbx-flow-shrink-out')}
              >
                {renderFor(trans.prevPath, false)}
              </g>
            )}
            <g
              key={`in-${path.join('-') || 'root'}`}
              className={cn('sbx-flow-layer', trans?.dir === 'out' ? 'sbx-flow-shrink-in' : trans ? 'sbx-flow-grow' : '')}
            >
              {renderFor(path, true)}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

'use client';

import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { cn } from '@/components/ui/cn';
import { toneHex } from '@/components/ui/tones';
import { formatQuantity } from '@/lib/format';
import { consolidateBuild, type ConsolidatedTier } from '../build-consolidate';
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
  const maxChars = Math.max(6, Math.floor((NODE_W - 26) / 6.2));
  return name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
}

// Centre `contentW` (scaled to fit, never upscaled) within the measured width.
function fit(width: number, contentW: number): { s: number; tx: number } {
  const s = Math.min(width / contentW, 1);
  return { s, tx: (width - s * contentW) / 2 };
}

function FlowLevel({
  root,
  display,
  width,
  onDrill,
}: {
  root: BuildNode;
  display: Display;
  width: number;
  onDrill: (chain: number[]) => void;
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
        const drillable = n.depth > 0 && n.node.inputs.length > 0;
        return (
          <g
            key={`n-${i}`}
            transform={`translate(${n.x}, ${n.y - NODE_H / 2})`}
            className={drillable ? 'flow-node' : undefined}
            onClick={drillable ? () => onDrill(chainTo(n)) : undefined}
          >
            <rect width={NODE_W} height={NODE_H} rx={3} fill="#0d0f14" stroke="#1e2535" />
            <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
            <text x={12} y={13} fill="#dce8f0" fontSize={11}>
              {trunc(d.name)}
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
          <text x={3} y={11} fill="#6a7a8a" fontSize={9} letterSpacing={1.2}>
            TIER {tier.depth}
          </text>
          {tier.items.map((it, j) => {
            const tone = toneHex[it.tone];
            const drillable = it.hasChildren;
            return (
              <g
                key={it.typeId}
                transform={`translate(0, ${HEADER_H + j * ROW})`}
                className={drillable ? 'flow-node' : undefined}
                onClick={drillable && onPick ? () => onPick(it.typeId) : undefined}
              >
                <rect width={NODE_W} height={NODE_H} rx={3} fill="#0d0f14" stroke="#1e2535" />
                <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
                <text x={12} y={13} fill="#dce8f0" fontSize={11}>
                  {trunc(it.name)}
                </text>
                <text x={12} y={24} fill={tone} fontSize={8} letterSpacing={0.4}>
                  {it.label.toUpperCase()}
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

export function BuildFlow({ structure }: { structure: BlueprintStructure }) {
  const { buildTree, buildNodeDisplay: display } = structure;
  const tiers = useMemo(() => consolidateBuild(structure).tiers, [structure]);
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

  const naturalHeight = (p: number[]): number => {
    if (!width) return 0;
    let cw: number;
    let ch: number;
    if (p.length === 0) {
      const maxItems = Math.max(1, ...tiers.map((t) => t.items.length));
      cw = Math.max(1, tiers.length) * COL_W;
      ch = HEADER_H + maxItems * ROW + PAD;
    } else {
      const f = focusOf(buildTree, display, p);
      const lvl = buildLevel(f, display, pickDepth(f));
      cw = lvl.contentW;
      ch = lvl.contentH;
    }
    return Math.round(ch * Math.min(width / cw, 1)) + 6;
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
      />
    );
  };

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
      <div className="mb-2.5 flex items-center gap-1.5 text-[10px] flex-wrap min-h-[18px]">
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
        <span className="ml-1 text-[9px] tracking-[0.1em] uppercase text-muted">
          {path.length > 0 ? 'zoomed · click a crumb to back out' : 'tiers · click a part for its flow'}
        </span>
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

'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import type { BlueprintStructure, BuildNode } from '@/features/industry-planner/types';
import { formatNodeQty, sortInputs, TONE_HEX, type Display } from './tree-shared';

// Tree v3 — Flow Connectors. A left-to-right node graph: depth becomes a column,
// each parent is centred on its children, curved connectors link them. Pure SVG
// (every position/colour is a presentation attribute, never an inline `style`).
//
// Layout: the columns are distributed across the MEASURED container width, so
// the graph never scrolls horizontally — it stays inside the page margins and
// grows DOWNWARD instead (fixed row height keeps node text readable). For a deep
// capital tree the columns get narrower (text truncates) and the panel gets tall.
//
// Drill-down: clicking a buildable node re-roots the graph on it (showing its
// connections) with a smooth zoom that emanates from the clicked node; a
// breadcrumb zooms back out. The animation style is selectable (zoom/fade/slide).

export type FlowAnim = 'zoom' | 'fade' | 'slide';

const ROW = 46;
const NODE_H = 32;
const GAP_X = 26;
const PAD_Y = 24;

interface Laid {
  node: BuildNode;
  depth: number;
  x: number;
  y: number;
  parent: Laid | null;
}

// Walk the build tree down a typeId path to the focused sub-root.
function focusOf(tree: BuildNode[], display: Display, path: number[]): BuildNode {
  let node = tree[0];
  for (const id of path) {
    const next = node.inputs.find((n) => n.typeId === id && !display[n.typeId].isRaw && n.inputs.length > 0);
    if (!next) break;
    node = next;
  }
  return node;
}

// Tidy layout of the focused subtree across `width`, returning placed nodes +
// the column width + the total height needed.
function layout(focus: BuildNode, display: Display, width: number) {
  let maxDepth = 0;
  const depthOf = (node: BuildNode, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    sortInputs(node.inputs, display).forEach((c) => depthOf(c, depth + 1));
  };
  depthOf(focus, 0);

  const col = width / (maxDepth + 1);
  const nodes: Laid[] = [];
  let leaf = 0;
  const round = (v: number) => Math.round(v * 100) / 100;

  const place = (node: BuildNode, depth: number, parent: Laid | null): Laid => {
    const laid: Laid = { node, depth, x: round(depth * col), y: 0, parent };
    const kids = sortInputs(node.inputs, display);
    if (kids.length === 0) {
      laid.y = round(PAD_Y + leaf * ROW + NODE_H / 2);
      leaf += 1;
    } else {
      const placed = kids.map((k) => place(k, depth + 1, laid));
      laid.y = round((placed[0].y + placed[placed.length - 1].y) / 2);
    }
    nodes.push(laid);
    return laid;
  };

  const root = place(focus, 0, null);
  const height = PAD_Y * 2 + Math.max(1, leaf) * ROW;
  return { nodes, root, col, height };
}

// The path from the focused root down to a clicked node (exclusive of root).
function pathToNode(laid: Laid): number[] {
  const chain: number[] = [];
  let cur: Laid | null = laid;
  while (cur && cur.parent) {
    chain.unshift(cur.node.typeId);
    cur = cur.parent;
  }
  return chain;
}

const ANIM_CLASS: Record<FlowAnim, { in: string; out: string }> = {
  zoom: { in: 'sbx-flow-in-zoom', out: 'sbx-flow-out-zoom' },
  fade: { in: 'sbx-flow-in-fade', out: 'sbx-flow-out-fade' },
  slide: { in: 'sbx-flow-in-slide', out: 'sbx-flow-out-slide' },
};

export function FlowConnectors({
  structure,
  anim = 'zoom',
}: {
  structure: BlueprintStructure;
  anim?: FlowAnim;
}) {
  const { buildTree, buildNodeDisplay: display } = structure;
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [dir, setDir] = useState<'in' | 'out'>('in');

  // Measure the container so the graph fits the page width (no horizontal scroll).
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

  // (The drill path resets by remount — the explorer keys this component on the
  // selected blueprint — so no structure-change effect is needed here.)
  const focus = focusOf(buildTree, display, path);
  const laidOut = useMemo(
    () => (width ? layout(focus, display, width) : null),
    [focus, display, width],
  );

  // Anchor the zoom origin on the focused (new root) node so the graph appears
  // to grow out of the node that was clicked.
  useLayoutEffect(() => {
    if (!laidOut || !contentRef.current) return;
    const ox = (laidOut.root.x + Math.max(40, laidOut.col - GAP_X) / 2) / width! * 100;
    const oy = (laidOut.root.y / laidOut.height) * 100;
    contentRef.current.style.setProperty('--ox', `${ox}%`);
    contentRef.current.style.setProperty('--oy', `${oy}%`);
  }, [laidOut, width]);

  const drill = (laid: Laid) => {
    if (laid.node.inputs.length === 0 || !laid.parent) return; // raw or current root
    setDir('in');
    setPath((p) => [...p, ...pathToNode(laid)]);
  };

  const zoomTo = (depth: number) => {
    setDir('out');
    setPath((p) => p.slice(0, depth));
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

  const nodeW = laidOut ? Math.max(40, laidOut.col - GAP_X) : 0;

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
                  onClick={() => zoomTo(i)}
                  className="text-muted hover:text-name cursor-pointer"
                >
                  {c.name}
                </button>
              )}
            </span>
          );
        })}
        {path.length > 0 && (
          <span className="ml-1 text-[9px] tracking-[0.1em] uppercase text-isk-sub">
            zoomed · click a crumb to back out
          </span>
        )}
      </div>

      <div ref={wrapRef} className="w-full">
        {laidOut && width && (
          <svg
            width={width}
            height={laidOut.height}
            viewBox={`0 0 ${width} ${laidOut.height}`}
            className="font-mono block"
            role="img"
            aria-label="Blueprint build tree as a flow graph"
          >
            <g
              ref={contentRef}
              key={`${path.join('-')}|${dir}`}
              className={cn('sbx-flow-content', ANIM_CLASS[anim][dir])}
            >
              {laidOut.nodes.map((n, i) => {
                if (!n.parent) return null;
                const sx = n.parent.x + nodeW;
                const sy = n.parent.y;
                const ex = n.x;
                const ey = n.y;
                const mx = (sx + ex) / 2;
                return (
                  <path
                    key={`e-${i}`}
                    d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`}
                    fill="none"
                    stroke={TONE_HEX[display[n.node.typeId].tone]}
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                  />
                );
              })}

              {laidOut.nodes.map((n, i) => {
                const d = display[n.node.typeId];
                const tone = TONE_HEX[d.tone];
                const buildable = n.node.inputs.length > 0 && n.parent !== null;
                const maxChars = Math.max(4, Math.floor((nodeW - 26) / 6.2));
                const label = d.name.length > maxChars ? `${d.name.slice(0, maxChars - 1)}…` : d.name;
                return (
                  <g
                    key={`n-${i}`}
                    transform={`translate(${n.x}, ${n.y - NODE_H / 2})`}
                    className={buildable ? 'sbx-flow-node' : undefined}
                    onClick={buildable ? () => drill(n) : undefined}
                  >
                    <rect width={nodeW} height={NODE_H} rx={3} fill="#0d0f14" stroke="#1e2535" />
                    <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
                    <text x={12} y={13} fill="#dce8f0" fontSize={11}>
                      {label}
                    </text>
                    <text x={12} y={24} fill={tone} fontSize={8} letterSpacing={0.4}>
                      {d.label.toUpperCase()}
                    </text>
                    <text x={nodeW - 9} y={19} fill="#6a7a8a" fontSize={10} textAnchor="end">
                      ×{formatNodeQty(n.node.quantity)}
                    </text>
                    {buildable && (
                      <text x={nodeW - 9} y={NODE_H - 3} fill={tone} fontSize={8} textAnchor="end">
                        ▸
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

'use client';

import { useLayoutEffect, useRef } from 'react';
import type { BlueprintStructure } from '@/features/industry-planner/types';
import { formatNodeQty, layoutHorizontal, TONE_HEX } from './tree-shared';

// Tree v3 — Flow Connectors. A left-to-right node graph: depth becomes a column,
// each parent is centred on its children, and curved connectors link them. Pure
// SVG — every position/colour is a presentation attribute (x, y, d, fill,
// stroke, transform), never an inline `style`. The connectors draw themselves in
// via a stroke-dashoffset keyframe; the per-path length + stagger index are set
// as CSS custom properties through ref.style.setProperty (CSP-clean).

const COL = 220;
const NODE_W = 184;
const NODE_H = 30;
const ROW = 40;
const PAD = 22;

export function FlowConnectors({ structure }: { structure: BlueprintStructure }) {
  const ref = useRef<SVGSVGElement>(null);
  const { nodes, height } = layoutHorizontal(structure.buildTree, structure.buildNodeDisplay, {
    colWidth: COL,
    rowHeight: ROW,
    topPad: PAD,
  });

  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  const width = (maxDepth + 1) * COL + 20;

  // Drive the draw-in: each connector path's real length + its order index,
  // applied as custom properties the .sbx-connector keyframe reads.
  useLayoutEffect(() => {
    const paths = ref.current?.querySelectorAll<SVGPathElement>('.sbx-connector');
    paths?.forEach((p, i) => {
      p.style.setProperty('--len', String(Math.ceil(p.getTotalLength())));
      p.style.setProperty('--d', String(i));
    });
  }, []);

  const edges = nodes.filter((n) => n.parent);

  return (
    <div className="overflow-x-auto">
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="font-mono"
        role="img"
        aria-label="Blueprint build tree as a flow graph"
      >
        {edges.map((n, i) => {
          const sx = n.parent!.x + NODE_W;
          const sy = n.parent!.y;
          const ex = n.x;
          const ey = n.y;
          const mx = (sx + ex) / 2;
          return (
            <path
              key={`e-${i}`}
              className="sbx-connector"
              d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`}
              fill="none"
              stroke={TONE_HEX[n.display.tone]}
              strokeOpacity={0.55}
              strokeWidth={1.5}
            />
          );
        })}

        {nodes.map((n, i) => {
          const tone = TONE_HEX[n.display.tone];
          return (
            <g key={`n-${i}`} transform={`translate(${n.x}, ${n.y - NODE_H / 2})`}>
              <rect width={NODE_W} height={NODE_H} rx={3} fill="#0d0f14" stroke="#1e2535" />
              <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
              <text x={12} y={13} fill="#dce8f0" fontSize={11}>
                {n.display.name.length > 20 ? `${n.display.name.slice(0, 19)}…` : n.display.name}
              </text>
              <text x={12} y={24} fill={tone} fontSize={8} letterSpacing={0.4}>
                {n.display.label.toUpperCase()}
              </text>
              <text x={NODE_W - 10} y={19} fill="#6a7a8a" fontSize={10} textAnchor="end">
                ×{formatNodeQty(n.quantity)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

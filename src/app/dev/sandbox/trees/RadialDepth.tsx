'use client';

import type { BlueprintStructure } from '@/features/industry-planner/types';
import { layoutHorizontal, TONE_HEX, type LaidNode } from './tree-shared';

// Tree v4 — Radial Depth Rings. The product sits at the centre; each build depth
// is a concentric ring, raws on the outermost. Reuses the tidy-tree ordering
// (so siblings stay adjacent) and projects it to polar coordinates. Pure SVG
// presentation attributes; nodes fade in from the centre outward via a
// keyframe whose stagger index is a CSS custom property.

const RING = 96;
const SIZE = 640;

export function RadialDepth({ structure }: { structure: BlueprintStructure }) {
  const { nodes, height } = layoutHorizontal(structure.buildTree, structure.buildNodeDisplay, {
    colWidth: 1,
    rowHeight: 40,
    topPad: 24,
  });

  const span = Math.max(1, height - 48);
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  // Project each laid node to a ring (radius = depth) and an angle (its tidy-tree
  // vertical position around the circle). Keyed by node identity so connectors
  // can look up parent coordinates. Coordinates are rounded to 2dp so the
  // server and client serialize byte-identical SVG attributes (raw trig output
  // differs in the last float digit across environments → a hydration mismatch).
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const pos = new Map<LaidNode, { x: number; y: number }>();
  for (const n of nodes) {
    const angle = ((n.y - 24) / span) * Math.PI * 1.9 - Math.PI / 2;
    const r = n.depth * RING;
    pos.set(n, { x: round2(cx + r * Math.cos(angle)), y: round2(cy + r * Math.sin(angle)) });
  }

  return (
    <div className="flex justify-center overflow-x-auto">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="font-mono max-w-full"
        role="img"
        aria-label="Blueprint build tree as concentric depth rings"
      >
        {/* Guide rings */}
        {[1, 2, 3].map((d) => (
          <circle key={d} cx={cx} cy={cy} r={d * RING} fill="none" stroke="#141a24" strokeWidth={1} />
        ))}

        {/* Connectors parent → child */}
        {nodes.map((n, i) => {
          if (!n.parent) return null;
          const a = pos.get(n.parent)!;
          const b = pos.get(n)!;
          return (
            <line
              key={`e-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={TONE_HEX[n.display.tone]}
              strokeOpacity={0.4}
              strokeWidth={1.25}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n, i) => {
          const p = pos.get(n)!;
          const tone = TONE_HEX[n.display.tone];
          const root = n.depth === 0;
          const rightSide = Math.cos(((n.y - 24) / span) * Math.PI * 1.9 - Math.PI / 2) >= 0;
          return (
            <g
              key={`n-${i}`}
              className="sbx-radial-node sbx-radial-fade"
              ref={(el) => el?.style.setProperty('--d', String(n.depth * 4 + (i % 4)))}
            >
              <circle cx={p.x} cy={p.y} r={root ? 9 : 5} fill="#0d0f14" stroke={tone} strokeWidth={root ? 2.5 : 1.75} />
              {root && <circle cx={p.x} cy={p.y} r={3} fill={tone} />}
              <text
                x={rightSide ? p.x + 10 : p.x - 10}
                y={p.y + 3}
                fill={root ? '#dce8f0' : '#9ab0c4'}
                fontSize={root ? 11 : 9.5}
                textAnchor={rightSide ? 'start' : 'end'}
              >
                {n.display.name.length > 18 ? `${n.display.name.slice(0, 17)}…` : n.display.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

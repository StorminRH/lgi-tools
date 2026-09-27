'use client';

import { type RefObject, useEffect, useState } from 'react';
import { type LeaderBox, type LeaderLine, leaderLines } from './board-leaders';

const WIDE = '(min-width: 1280px)';
const PANEL_GAP = 16;

function boxWithin(element: Element, origin: DOMRect): LeaderBox {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    right: rect.right - origin.left,
    bottom: rect.bottom - origin.top,
  };
}

function measure(root: HTMLElement): LeaderLine[] {
  const anchor = root.querySelector('[data-leader-anchor]');
  const column = root.querySelector('[data-leader-column]');
  if (anchor === null || column === null || !window.matchMedia(WIDE).matches) return [];
  const origin = root.getBoundingClientRect();
  const panels = [...root.querySelectorAll('[data-leader-target]')].map((panel, index) => ({
    key: String(index),
    box: boxWithin(panel, origin),
  }));
  return leaderLines(boxWithin(anchor, origin), boxWithin(column, origin).right, panels, PANEL_GAP);
}

/** Atlas-style callout lines from the portrait to each readout, on wide screens only. */
export function BoardLeaders({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const [lines, setLines] = useState<LeaderLine[]>([]);
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const observer = new ResizeObserver(() => setLines(measure(root)));
    observer.observe(root);
    for (const panel of root.querySelectorAll('[data-leader-target]')) observer.observe(panel);
    return () => observer.disconnect();
  }, [rootRef]);
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 hidden size-full overflow-visible xl:block">
      {lines.map((line) => (
        <g key={line.key}>
          <path
            d={line.d}
            pathLength={1}
            fill="none"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="board-leader stroke-isk"
          />
          <circle cx={line.end.x} cy={line.end.y} r={2.5} className="board-leader-dot fill-isk" />
        </g>
      ))}
    </svg>
  );
}

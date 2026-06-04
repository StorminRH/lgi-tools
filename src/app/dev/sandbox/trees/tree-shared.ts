// Shared helpers for the build-tree sandbox variants. All five views consume
// the same MOCK_STRUCTURE (buildTree + buildNodeDisplay); these helpers turn
// that nested shape into the flat / laid-out forms each view needs. No React,
// no DOM — pure data.

import type { Tone } from '@/components/ui/tones';
import type { BuildNode, BuildNodeDisplay } from '@/features/industry-planner/types';

export type Display = Record<number, BuildNodeDisplay>;

// Tone → hex for the SVG views (flow connectors, radial depth), where colour is
// a presentation attribute, not a class. Mirrors the Pill text colours.
export const TONE_HEX: Record<Tone, string> = {
  neutral: '#6a7a8a',
  green: '#3dd68c',
  'green-strong': '#44dd99',
  orange: '#d68c3d',
  'orange-soft': '#cc7733',
  red: '#dd4444',
  'red-soft': '#cc5555',
  magenta: '#cc55cc',
  purple: '#aa55ff',
  yellow: '#ccaa33',
  teal: '#33cc88',
  blue: '#3399cc',
};

// Buildable items first, then by component-type label, then alphabetical —
// matching the live BuildCascade ordering so the sandbox reads like the real tool.
export function sortInputs(inputs: BuildNode[], display: Display): BuildNode[] {
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

export interface FlatRow {
  node: BuildNode;
  display: BuildNodeDisplay;
  depth: number;
  hasChildren: boolean;
  // Per-ancestor "is this the last sibling" flags, for drawing outline guides.
  ancestorIsLast: boolean[];
  isLast: boolean;
}

// Pre-order depth-first flatten, sorted at each level. Used by the indented
// outline and density-table views.
export function flattenTree(tree: BuildNode[], display: Display): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (nodes: BuildNode[], depth: number, ancestorIsLast: boolean[]) => {
    const sorted = sortInputs(nodes, display);
    sorted.forEach((node, i) => {
      const isLast = i === sorted.length - 1;
      rows.push({
        node,
        display: display[node.typeId],
        depth,
        hasChildren: node.inputs.length > 0,
        ancestorIsLast,
        isLast,
      });
      if (node.inputs.length > 0) {
        walk(node.inputs, depth + 1, [...ancestorIsLast, isLast]);
      }
    });
  };
  walk(tree, 0, []);
  return rows;
}

// --- Laid-out node forms for the SVG views -------------------------------

export interface LaidNode {
  typeId: number;
  display: BuildNodeDisplay;
  quantity: number;
  depth: number;
  x: number;
  y: number;
  parent: LaidNode | null;
}

// A tidy left-to-right tree layout: depth → x column, leaves stacked top-to-
// bottom, each parent centred on the vertical span of its children. Returns the
// nodes plus the bounding height needed. Used by the flow-connector view.
export function layoutHorizontal(
  tree: BuildNode[],
  display: Display,
  opts: { colWidth: number; rowHeight: number; topPad: number },
): { nodes: LaidNode[]; height: number } {
  const nodes: LaidNode[] = [];
  let leafCursor = 0;

  const place = (node: BuildNode, depth: number, parent: LaidNode | null): LaidNode => {
    const laid: LaidNode = {
      typeId: node.typeId,
      display: display[node.typeId],
      quantity: node.quantity,
      depth,
      x: depth * opts.colWidth,
      y: 0,
      parent,
    };
    const children = sortInputs(node.inputs, display);
    if (children.length === 0) {
      laid.y = opts.topPad + leafCursor * opts.rowHeight;
      leafCursor += 1;
    } else {
      const placed = children.map((c) => place(c, depth + 1, laid));
      laid.y = (placed[0].y + placed[placed.length - 1].y) / 2;
    }
    nodes.push(laid);
    return laid;
  };

  sortInputs(tree, display).forEach((root) => place(root, 0, null));
  const height = opts.topPad * 2 + Math.max(1, leafCursor) * opts.rowHeight;
  return { nodes, height };
}

// Group nodes by depth, for the radial-rings view.
export function groupByDepth(tree: BuildNode[], display: Display): BuildNode[][] {
  const levels: BuildNode[][] = [];
  const walk = (nodes: BuildNode[], depth: number) => {
    if (!levels[depth]) levels[depth] = [];
    const sorted = sortInputs(nodes, display);
    for (const node of sorted) {
      levels[depth].push(node);
      if (node.inputs.length > 0) walk(node.inputs, depth + 1);
    }
  };
  walk(tree, 0);
  return levels;
}

// A short marginal quantity reads "< 1" rather than "0" (matches the live view).
export function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return Math.round(quantity).toLocaleString('en-US');
}

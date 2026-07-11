// Pure layout math for the build-plan flow graph (BuildFlow), pulled out of the
// component so the geometry, depth budgeting, path-finding, and column layout are
// unit-tested and the component stays SVG presentation only. No React, no DOM.
// `sortInputs` is shared with the dev tree sandbox (its byte-identical copy is
// gone) so the live view and the sandbox can never order nodes differently.

import { toneHex } from '@/components/ui/tones';
import { formatQuantity } from '@/lib/format/number';
import type { ConsolidatedItem, ConsolidatedTier } from './build-consolidate';
import type { BuildNode, BuildNodeDisplay } from './types';

export type Display = Record<number, BuildNodeDisplay>;

export const COL = 210;
export const NODE_W = 184;
export const NODE_H = 32;
export const ROW = 46;
export const PAD = 22;
export const COL_W = 212;
export const HEADER_H = 28;
export const MAX_NODES = 46; // per-level node budget; deeper/wider trees show fewer levels
export const TRANS_MS = 440;
export const MAX_SCALE = 1.75; // scale columns UP to fill the width, but not past this
export const ICON = 20; // type-icon square inside a node box
export const TEXT_X = 32; // node text x-offset, leaving room for the icon
export const GROUP_H = 22; // category sub-header band (label + rule) in the overview columns
export const GROUP_GAP = 8; // gap below a category group before the next one

export function formatNodeQty(quantity: number): string {
  if (quantity > 0 && quantity < 0.5) return '< 1';
  return formatQuantity(quantity);
}

// Buildable items first, then by component-type label, then alphabetical —
// matching the live BuildCascade ordering. Shared with the dev tree sandbox.
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

export interface Laid {
  node: BuildNode;
  depth: number;
  x: number;
  y: number;
  parent: Laid | null;
  children: Laid[];
}

export function countWithin(node: BuildNode, maxDepth: number): number {
  if (maxDepth <= 0) return 1;
  let c = 1;
  for (const k of node.inputs) c += countWithin(k, maxDepth - 1);
  return c;
}

// The deepest level (2 then 1) whose node count fits the per-level budget.
export function pickDepth(root: BuildNode): number {
  for (const d of [2, 1]) {
    if (countWithin(root, d) <= MAX_NODES) return d;
  }
  return 1;
}

// Lay a focus level out left-to-right: depth → x column, leaves stacked, each
// parent centred on its children's vertical span. Returns the placed nodes plus
// the content bounds.
export function buildLevel(root: BuildNode, display: Display, maxDepth: number) {
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

// The typeId chain from the focus root down to a laid node (exclusive of root).
export function chainTo(laid: Laid): number[] {
  const chain: number[] = [];
  let cur: Laid | null = laid;
  while (cur && cur.parent) {
    chain.unshift(cur.node.typeId);
    cur = cur.parent;
  }
  return chain;
}

// Walk a drill path from the tree root to the focused buildable node, stopping at
// the first raw/leaf/missing step (the deepest still-drillable node reached).
export function focusOf(tree: BuildNode[], display: Display, path: number[]): BuildNode {
  let node = tree[0];
  for (const id of path) {
    const next = node.inputs.find((n) => n.typeId === id && !display[n.typeId].isRaw && n.inputs.length > 0);
    if (!next) break;
    node = next;
  }
  return node;
}

// The drill path to a typeId anywhere in the tree (DFS), or null if not found.
export function findPath(tree: BuildNode[], typeId: number): number[] | null {
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

// Truncate a node name to the box's char budget (SVG text has no auto-ellipsis).
export function trunc(name: string): string {
  const maxChars = Math.max(6, Math.floor((NODE_W - TEXT_X - 36) / 6.2));
  return name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
}

// Truncate a category label to a char budget.
export function truncTo(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

// Contiguous category groups within a tier column. Items arrive pre-sorted by
// label (see consolidateBuild), so a single pass yields one block per category.
export function tierGroups(
  items: ConsolidatedItem[],
): { label: string; tone: string; items: ConsolidatedItem[] }[] {
  const groups: { label: string; tone: string; items: ConsolidatedItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === it.label) last.items.push(it);
    else groups.push({ label: it.label, tone: toneHex[it.tone], items: [it] });
  }
  return groups;
}

export interface ColRow {
  kind: 'header' | 'item';
  y: number;
  label?: string;
  tone?: string;
  item?: ConsolidatedItem;
}

// Lay a tier column out as stacked category sub-blocks: a header band (label +
// rule) followed by its item rows, then a gap before the next category. Returns
// the positioned rows and the total column height (shared with naturalHeightFor).
export function layoutTier(items: ConsolidatedItem[]): { rows: ColRow[]; height: number } {
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

// Scale `contentW` to fill the measured width (up to MAX_SCALE) and centre it, so
// the columns fill the space under the hero header; with more columns than fit,
// the scale drops below 1 and they shrink to fit instead.
export function fit(width: number, contentW: number): { s: number; tx: number } {
  const s = Math.min(width / contentW, MAX_SCALE);
  return { s, tx: (width - s * contentW) / 2 };
}

// The graph's natural (unscaled-then-scaled) pixel height for a focus path: the
// consolidated tier columns at the root, or the drilled focus level below it,
// scaled to the measured width. 0 before the first measure (width null).
export function naturalHeightFor(
  path: number[],
  tiers: ConsolidatedTier[],
  buildTree: BuildNode[],
  display: Display,
  width: number | null,
): number {
  if (!width) return 0;
  let cw: number;
  let ch: number;
  if (path.length === 0) {
    cw = Math.max(1, tiers.length) * COL_W;
    ch = Math.max(1, ...tiers.map((t) => layoutTier(t.items).height));
  } else {
    const f = focusOf(buildTree, display, path);
    const lvl = buildLevel(f, display, pickDepth(f));
    cw = lvl.contentW;
    ch = lvl.contentH;
  }
  return Math.round(ch * Math.min(width / cw, MAX_SCALE)) + 6;
}

// The node box's text baselines: a labelled node (drilled graph) splits the name
// and quantity onto their own rows; an unlabelled one (overview) centres a single
// line, and the GroupHeader carries the category label instead.
export function flowNodeLayout(label?: string): { hasLabel: boolean; nameY: number; qtyY: number } {
  const hasLabel = !!label;
  return { hasLabel, nameY: hasLabel ? 13 : 20, qtyY: hasLabel ? 19 : 20 };
}

// A drilled node's interactivity: the focused root steps out (back), a deeper
// node with children drills in, everything else is inert. Returns the node class,
// the right-edge indicator, and the click action the shell dispatches.
export function flowNodeInteract(
  laid: { parent: unknown | null; depth: number; node: { inputs: unknown[] } },
  hasBackOut: boolean,
): { className: string | undefined; indicator: 'back' | 'drill' | undefined; action: 'back' | 'drill' | 'none' } {
  const canBack = laid.parent === null && hasBackOut;
  const drillable = laid.depth > 0 && laid.node.inputs.length > 0;
  const action: 'back' | 'drill' | 'none' = canBack ? 'back' : drillable ? 'drill' : 'none';
  return {
    className: canBack || drillable ? 'flow-node' : undefined,
    indicator: action === 'none' ? undefined : action,
    action,
  };
}

// An overview-column node's interactivity: a node with its own inputs drills in
// (given a pick handler); a leaf is inert.
export function columnNodeInteract(
  hasChildren: boolean,
  hasPick: boolean,
): { className: string | undefined; indicator: 'drill' | undefined; clickable: boolean } {
  return {
    className: hasChildren ? 'flow-node' : undefined,
    indicator: hasChildren ? 'drill' : undefined,
    clickable: hasChildren && hasPick,
  };
}

// The cross-fade layer classes for the transition animation.
export function outLayerClass(dir: 'in' | 'out'): string {
  return dir === 'in' ? 'flow-recede' : 'flow-shrink-out';
}

export function inLayerClass(trans: { dir: 'in' | 'out' } | null): string {
  return trans?.dir === 'out' ? 'flow-shrink-in' : trans ? 'flow-grow' : '';
}

// The stable React key for a focus layer — the path joined, or 'root' at the top.
export function layerKey(path: number[]): string {
  return path.join('-') || 'root';
}

// The breadcrumb hint over the graph — drill affordances once a part is focused.
export function breadcrumbText(path: number[]): string {
  return path.length > 0
    ? 'click ‹ back to step out · click a part for its flow'
    : 'tiers · click a part for its flow';
}

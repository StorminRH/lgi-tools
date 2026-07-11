import { describe, expect, it } from 'vitest';
import type { ConsolidatedItem } from './build-consolidate';
import {
  breadcrumbText,
  buildLevel,
  columnNodeInteract,
  countWithin,
  findPath,
  fit,
  flowNodeInteract,
  flowNodeLayout,
  focusOf,
  formatNodeQty,
  inLayerClass,
  layerKey,
  layoutTier,
  outLayerClass,
  pickDepth,
  sortInputs,
  trunc,
  truncTo,
  type Display,
} from './build-tree-layout';
import type { BuildNode, BuildNodeDisplay } from './types';

const node = (typeId: number, quantity: number, inputs: BuildNode[] = []): BuildNode => ({
  typeId,
  quantity,
  inputs,
});
const disp = (over: Partial<BuildNodeDisplay> & { name: string }): BuildNodeDisplay => ({
  height: 0,
  isRaw: false,
  label: 'Component',
  tone: 'green',
  ...over,
});

describe('formatNodeQty', () => {
  it('reads a positive sub-half share as "< 1"', () => {
    expect(formatNodeQty(0.3)).toBe('< 1');
  });
  it('formats whole quantities with separators', () => {
    expect(formatNodeQty(12000)).toBe('12,000');
    expect(formatNodeQty(0)).toBe('0');
  });
});

describe('sortInputs', () => {
  it('orders buildables before raws, then by label, then by name', () => {
    const display: Display = {
      1: disp({ name: 'Zeta', isRaw: false, label: 'Component' }),
      2: disp({ name: 'Alpha', isRaw: true, label: 'Mineral' }),
      3: disp({ name: 'Beta', isRaw: false, label: 'Component' }),
      4: disp({ name: 'Gamma', isRaw: false, label: 'Assembly' }),
    };
    const sorted = sortInputs([node(1, 1), node(2, 1), node(3, 1), node(4, 1)], display);
    // Buildables first (4 Assembly, then 3/1 Component by name), then the raw (2).
    expect(sorted.map((n) => n.typeId)).toEqual([4, 3, 1, 2]);
  });
});

describe('countWithin / pickDepth', () => {
  const deep = node(1, 1, [node(2, 1, [node(3, 1, [node(4, 1)])])]);

  it('counts nodes within a depth budget', () => {
    expect(countWithin(deep, 0)).toBe(1);
    expect(countWithin(deep, 1)).toBe(2);
    expect(countWithin(deep, 2)).toBe(3);
  });

  it('picks depth 2 when it fits the node budget, else 1', () => {
    expect(pickDepth(deep)).toBe(2);
    // A very wide root blows the 46-node budget at depth 2 → falls back to 1.
    const wide = node(1, 1, Array.from({ length: 40 }, (_, i) => node(100 + i, 1, [node(200 + i, 1)])));
    expect(pickDepth(wide)).toBe(1);
  });
});

describe('buildLevel', () => {
  it('columns by depth, stacks leaves, and centres a parent on its children', () => {
    const display: Display = {
      1: disp({ name: 'Root' }),
      2: disp({ name: 'A' }),
      3: disp({ name: 'B' }),
    };
    const root = node(1, 1, [node(2, 1), node(3, 1)]);
    const { nodes, contentW } = buildLevel(root, display, 2);
    const laidRoot = nodes.find((n) => n.node.typeId === 1)!;
    const a = nodes.find((n) => n.node.typeId === 2)!;
    const b = nodes.find((n) => n.node.typeId === 3)!;
    expect(a.depth).toBe(1);
    // Root centred between its two leaves.
    expect(laidRoot.y).toBeCloseTo((a.y + b.y) / 2, 6);
    expect(contentW).toBeGreaterThan(0);
  });
});

describe('focusOf / findPath / chainTo', () => {
  const display: Display = {
    1: disp({ name: 'Product' }),
    2: disp({ name: 'Buildable', isRaw: false }),
    3: disp({ name: 'Leaf', isRaw: true }),
    4: disp({ name: 'Deep', isRaw: false }),
  };
  // Product(1) → Buildable(2) → Deep(4); plus a raw leaf(3) under the product.
  const tree = [node(1, 1, [node(2, 1, [node(4, 1, [node(3, 1)])]), node(3, 1)])];

  it('finds the drill path to a typeId', () => {
    expect(findPath(tree, 4)).toEqual([2, 4]);
    expect(findPath(tree, 999)).toBeNull();
  });

  it('walks a path to the focused buildable, stopping at a raw/leaf', () => {
    expect(focusOf(tree, display, [2]).typeId).toBe(2);
    // A raw leaf is not drillable — the walk stops before it.
    expect(focusOf(tree, display, [3]).typeId).toBe(1);
  });
});

describe('trunc / truncTo', () => {
  it('ellipsises names/labels past the char budget', () => {
    expect(truncTo('SHORT', 10)).toBe('SHORT');
    expect(truncTo('A VERY LONG CATEGORY LABEL', 8)).toBe('A VERY …');
    expect(trunc('x'.repeat(200)).endsWith('…')).toBe(true);
  });
});

describe('layoutTier', () => {
  const item = (over: Partial<ConsolidatedItem>): ConsolidatedItem => ({
    typeId: 1,
    name: 'X',
    label: 'Component',
    tone: 'green',
    isRaw: false,
    quantity: 1,
    hasChildren: false,
    ...over,
  });

  it('emits a header per contiguous category, then its item rows, with a total height', () => {
    const rows = layoutTier([
      item({ typeId: 1, label: 'Component' }),
      item({ typeId: 2, label: 'Component' }),
      item({ typeId: 3, label: 'Mineral' }),
    ]);
    const headers = rows.rows.filter((r) => r.kind === 'header');
    const items = rows.rows.filter((r) => r.kind === 'item');
    expect(headers.map((h) => h.label)).toEqual(['Component', 'Mineral']);
    expect(items).toHaveLength(3);
    expect(rows.height).toBeGreaterThan(0);
  });
});

describe('fit', () => {
  it('scales up to fill the width but never past MAX_SCALE, centring the content', () => {
    // Narrow content in a wide box → clamped at 1.75, centred.
    const { s, tx } = fit(1000, 100);
    expect(s).toBe(1.75);
    expect(tx).toBeCloseTo((1000 - 1.75 * 100) / 2, 6);
    // Wide content → scale below 1 to fit.
    expect(fit(200, 1000).s).toBe(0.2);
  });
});

describe('flowNodeLayout', () => {
  it('splits name/qty rows for a labelled node, centres a single line otherwise', () => {
    expect(flowNodeLayout('Category')).toEqual({ hasLabel: true, nameY: 13, qtyY: 19 });
    expect(flowNodeLayout(undefined)).toEqual({ hasLabel: false, nameY: 20, qtyY: 20 });
  });
});

describe('flowNodeInteract', () => {
  const laid = (parent: unknown, depth: number, inputs: number) => ({
    parent,
    depth,
    node: { inputs: Array.from({ length: inputs }, () => 0) },
  });

  it('makes the focused root a back step only when a back-out is available', () => {
    expect(flowNodeInteract(laid(null, 0, 2), true)).toEqual({
      className: 'flow-node',
      indicator: 'back',
      action: 'back',
    });
    // Root at the top level (no back-out) is inert.
    expect(flowNodeInteract(laid(null, 0, 2), false).action).toBe('none');
  });

  it('makes a deeper node with children drillable', () => {
    expect(flowNodeInteract(laid({}, 1, 3), false)).toEqual({
      className: 'flow-node',
      indicator: 'drill',
      action: 'drill',
    });
  });

  it('leaves a childless (leaf) node inert', () => {
    expect(flowNodeInteract(laid({}, 1, 0), false)).toEqual({
      className: undefined,
      indicator: undefined,
      action: 'none',
    });
  });
});

describe('columnNodeInteract', () => {
  it('makes a node with children drillable when a pick handler exists', () => {
    expect(columnNodeInteract(true, true)).toEqual({
      className: 'flow-node',
      indicator: 'drill',
      clickable: true,
    });
  });

  it('marks a drillable node but not clickable without a pick handler', () => {
    expect(columnNodeInteract(true, false)).toEqual({
      className: 'flow-node',
      indicator: 'drill',
      clickable: false,
    });
  });

  it('leaves a leaf inert', () => {
    expect(columnNodeInteract(false, true)).toEqual({
      className: undefined,
      indicator: undefined,
      clickable: false,
    });
  });
});

describe('transition + breadcrumb helpers', () => {
  it('maps the cross-fade layer classes', () => {
    expect(outLayerClass('in')).toBe('flow-recede');
    expect(outLayerClass('out')).toBe('flow-shrink-out');
    expect(inLayerClass(null)).toBe('');
    expect(inLayerClass({ dir: 'in' })).toBe('flow-grow');
    expect(inLayerClass({ dir: 'out' })).toBe('flow-shrink-in');
  });

  it('shows the drill affordance only once a part is focused', () => {
    expect(breadcrumbText([])).toBe('tiers · click a part for its flow');
    expect(breadcrumbText([2, 4])).toContain('back to step out');
  });

  it('keys a layer by its path, or "root" at the top', () => {
    expect(layerKey([])).toBe('root');
    expect(layerKey([2, 4])).toBe('2-4');
  });
});

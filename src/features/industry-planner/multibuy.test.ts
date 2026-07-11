import { describe, expect, it } from 'vitest';
import treesFixture from '@/data/eve-data/__fixtures__/blueprint-trees.json';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import {
  assignBuildTiers,
  buildMultibuyText,
  hasOwnedStock,
  multibuyBuildSet,
  multibuyEntries,
  pluralCount,
  tierRowsFromTierOf,
} from './multibuy';

describe('assignBuildTiers — one home tier per buildable (min occurrence depth)', () => {
  it('a type consumed at two depths is assigned the shallower one', () => {
    // C appears at depth 1 (direct product input) and depth 2 (under A).
    const c = (qty: number): TreeNode => ({
      typeId: 200,
      quantity: qty,
      producedBy: { blueprintTypeId: 1200, quantityPerRun: 10, runsNeeded: qty / 10 },
      inputs: [{ typeId: 300, quantity: 7, inputs: [] }],
    });
    const tree: TreeNode[] = [
      c(5),
      {
        typeId: 100,
        quantity: 2,
        producedBy: { blueprintTypeId: 1100, quantityPerRun: 1, runsNeeded: 2 },
        inputs: [c(300)],
      },
    ];
    expect(assignBuildTiers(tree)).toEqual(
      new Map([
        [200, 1], // min(1, 2)
        [100, 1],
      ]),
    );
  });

  it('raws are never assigned a tier', () => {
    const tree: TreeNode[] = [{ typeId: 300, quantity: 7, inputs: [] }];
    expect(assignBuildTiers(tree)).toEqual(new Map());
  });

  // Property pin over every committed tree: the assignment IS the minimum of a
  // type's occurrence depths (independent all-depths oracle), and only
  // buildables are assigned.
  const fixtures = Object.entries(treesFixture as Record<string, TreeNode[]>);
  const allDepths = (tree: TreeNode[]): Map<number, number[]> => {
    const depths = new Map<number, number[]>();
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        if (!node.producedBy) continue;
        depths.set(node.typeId, [...(depths.get(node.typeId) ?? []), depth]);
        walk(node.inputs, depth + 1);
      }
    };
    walk(tree, 1);
    return depths;
  };

  for (const [name, tree] of fixtures) {
    it(`${name}: every buildable gets exactly min(occurrence depths)`, () => {
      const tiers = assignBuildTiers(tree);
      const oracle = allDepths(tree);
      expect([...tiers.keys()].sort()).toEqual([...oracle.keys()].sort());
      for (const [typeId, depths] of oracle) {
        expect(tiers.get(typeId), `type ${typeId}`).toBe(Math.min(...depths));
      }
    });
  }

  it('Archon: Helium Fuel Blocks (4247) occur at multiple depths, homed at the shallowest', () => {
    const archon = (treesFixture as Record<string, TreeNode[]>).Archon;
    const depths = allDepths(archon).get(4247) ?? [];
    expect(new Set(depths).size).toBeGreaterThan(1); // genuinely multi-depth
    expect(assignBuildTiers(archon).get(4247)).toBe(Math.min(...depths));
  });
});

describe('multibuyEntries — deterministic line order', () => {
  const nameOf = (id: number) =>
    ({ 100: 'Construction Blocks', 200: 'Antimatter Reactor Unit', 34: 'Tritanium', 35: 'Pyerite' })[
      id
    ] ?? `Type ${id}`;

  it('bought intermediates first (tier, then name); raws last (by name)', () => {
    const buy = new Map([
      [34, 2556], // raw
      [200, 5], // tier 2
      [35, 100], // raw
      [100, 8], // tier 1
    ]);
    const tierOf = (id: number) => ({ 100: 1, 200: 2 })[id];
    expect(multibuyEntries(buy, nameOf, tierOf)).toEqual([
      { name: 'Construction Blocks', qty: 8 },
      { name: 'Antimatter Reactor Unit', qty: 5 },
      { name: 'Pyerite', qty: 100 },
      { name: 'Tritanium', qty: 2556 },
    ]);
  });

  it('same tier sorts by name', () => {
    const buy = new Map([
      [200, 5],
      [100, 8],
    ]);
    const tierOf = () => 1;
    expect(multibuyEntries(buy, nameOf, tierOf).map((e) => e.name)).toEqual([
      'Antimatter Reactor Unit',
      'Construction Blocks',
    ]);
  });
});

describe('buildMultibuyText — the in-game clipboard string', () => {
  it('emits Name<TAB>qty lines, newline-joined, no trailing newline', () => {
    expect(
      buildMultibuyText([
        { name: 'Fullerite-C50', qty: 1000 },
        { name: 'Tritanium', qty: 2556 },
      ]),
    ).toBe('Fullerite-C50\t1000\nTritanium\t2556');
  });

  it('never emits thousand separators', () => {
    expect(buildMultibuyText([{ name: 'Tritanium', qty: 1_234_567 }])).toBe('Tritanium\t1234567');
  });

  it('ceils a fractional quantity defensively', () => {
    expect(buildMultibuyText([{ name: 'Fuel Block', qty: 2.1 }])).toBe('Fuel Block\t3');
  });

  it('drops zero-quantity lines', () => {
    expect(
      buildMultibuyText([
        { name: 'Tritanium', qty: 0 },
        { name: 'Pyerite', qty: 1 },
      ]),
    ).toBe('Pyerite\t1');
  });

  it('empty list → empty string', () => {
    expect(buildMultibuyText([])).toBe('');
  });
});

describe('tierRowsFromTierOf', () => {
  it('counts buildables per tier, ascending by depth', () => {
    // typeIds 10,11 at tier 1; 20 at tier 2.
    const tierOf = new Map<number, number>([
      [10, 1],
      [11, 1],
      [20, 2],
    ]);
    expect(tierRowsFromTierOf(tierOf)).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });
});

describe('multibuyBuildSet', () => {
  const tierOf = new Map<number, number>([
    [10, 1],
    [11, 1],
    [20, 2],
  ]);

  it('includes every type whose tier is still checked', () => {
    expect([...multibuyBuildSet(tierOf, new Set())].sort((a, b) => a - b)).toEqual([10, 11, 20]);
  });

  it('excludes types on an unchecked tier', () => {
    expect([...multibuyBuildSet(tierOf, new Set([1]))]).toEqual([20]);
  });
});

describe('hasOwnedStock', () => {
  it('is false for null / empty overlays, true when any stock is present', () => {
    expect(hasOwnedStock(null)).toBe(false);
    expect(hasOwnedStock(new Map())).toBe(false);
    expect(hasOwnedStock(new Map([[1, 5]]))).toBe(true);
  });
});

describe('pluralCount', () => {
  it('uses the singular for exactly one, the plural otherwise', () => {
    expect(pluralCount(1, 'item', 'items')).toBe('1 item');
    expect(pluralCount(0, 'item', 'items')).toBe('0 items');
    expect(pluralCount(3, 'type', 'types')).toBe('3 types');
  });
});

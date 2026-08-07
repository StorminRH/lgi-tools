import { describe, expect, it } from 'vitest';
import {
  buildAdjacencyGraph,
  buildSystemDirectory,
  buildWormholeCodex,
  resolveWormholeAttributeIds,
} from './universe-assets';
import { wormholeSizeClass } from './wormhole-contract';

const ATTRIBUTE_ROWS = [
  { id: 1381, name: 'wormholeTargetSystemClass' },
  { id: 1382, name: 'wormholeMaxStableTime' },
  { id: 1383, name: 'wormholeMaxStableMass' },
  { id: 1384, name: 'wormholeMassRegeneration' },
  { id: 1385, name: 'wormholeMaxJumpMass' },
];

const B274_ATTRIBUTES = {
  1381: 7,
  1382: 1440,
  1383: 2_000_000_000,
  1384: 0,
  1385: 375_000_000,
};

describe('universe asset builders', () => {
  it('sorts the system directory and adjacency graph deterministically', () => {
    expect(
      buildSystemDirectory([
        { id: 2, name: 'Perimeter', whClassId: 7, security: 1 },
        { id: 1, name: 'Jita', whClassId: 7, security: 0.9 },
      ]),
    ).toEqual([
      { id: 1, name: 'Jita', whClassId: 7, security: 0.9 },
      { id: 2, name: 'Perimeter', whClassId: 7, security: 1 },
    ]);
    expect(
      buildAdjacencyGraph([
        { fromSystemId: 2, toSystemId: 1 },
        { fromSystemId: 1, toSystemId: 3 },
        { fromSystemId: 1, toSystemId: 2 },
        { fromSystemId: 1, toSystemId: 2 },
      ]),
    ).toEqual([
      [1, [2, 3]],
      [2, [1]],
    ]);
  });

  it('resolves attribute IDs by name rather than relying on their current numbers', () => {
    const renumbered = ATTRIBUTE_ROWS.map((row, index) => ({
      ...row,
      id: 9000 + index,
    }));
    expect(resolveWormholeAttributeIds(renumbered)).toEqual({
      targetClass: 9000,
      lifetimeMinutes: 9001,
      totalMass: 9002,
      massRegen: 9003,
      maxJumpMass: 9004,
    });
    expect(() =>
      resolveWormholeAttributeIds(ATTRIBUTE_ROWS.slice(1)),
    ).toThrow(/wormholeTargetSystemClass/);
  });

  it('maps every jump-mass threshold into an exhaustive size class', () => {
    expect(wormholeSizeClass(5_000_000)).toBe('S');
    expect(wormholeSizeClass(5_000_001)).toBe('M');
    expect(wormholeSizeClass(62_000_000)).toBe('M');
    expect(wormholeSizeClass(62_000_001)).toBe('L');
    expect(wormholeSizeClass(410_000_000)).toBe('L');
    expect(wormholeSizeClass(410_000_001)).toBe('XL');
  });
});

describe('wormhole codex builder', () => {
  it('builds the full typed row and the explicit K162 far-side row', () => {
    expect(
      buildWormholeCodex(
        [
          { id: 30831, name: 'Wormhole K162', attributes: null },
          {
            id: 30647,
            name: 'Wormhole B274',
            attributes: B274_ATTRIBUTES,
          },
        ],
        ATTRIBUTE_ROWS,
      ),
    ).toEqual([
      {
        code: 'B274',
        typeId: 30647,
        farSide: false,
        totalMass: 2_000_000_000,
        maxJumpMass: 375_000_000,
        massRegen: 0,
        lifetimeMinutes: 1440,
        sizeClass: 'L',
        targetClass: 7,
      },
      { code: 'K162', typeId: 30831, farSide: true },
    ]);
  });

  it('excludes only the two exact known QA records', () => {
    expect(
      buildWormholeCodex(
        [
          { id: 32_894, name: 'QA Wormhole A', attributes: {} },
          { id: 32_895, name: 'QA Wormhole B', attributes: {} },
          { id: 30_831, name: 'Wormhole K162', attributes: null },
        ],
        ATTRIBUTE_ROWS,
      ),
    ).toEqual([{ code: 'K162', typeId: 30_831, farSide: true }]);

    expect(() =>
      buildWormholeCodex(
        [{ id: 99_999, name: 'QA Wormhole A', attributes: {} }],
        ATTRIBUTE_ROWS,
      ),
    ).toThrow(/unexpected name/);
    expect(() =>
      buildWormholeCodex(
        [{ id: 32_894, name: 'QA Wormhole Renamed', attributes: {} }],
        ATTRIBUTE_ROWS,
      ),
    ).toThrow(/unexpected name/);
  });

  it('fails loudly for every non-K162 drift shape', () => {
    expect(() =>
      buildWormholeCodex(
        [{ id: 1, name: 'Wormhole B274', attributes: null }],
        ATTRIBUTE_ROWS,
      ),
    ).toThrow(/has no dogma row/);
    expect(() =>
      buildWormholeCodex(
        [
          {
            id: 1,
            name: 'Wormhole B274',
            attributes: { ...B274_ATTRIBUTES, 1385: undefined },
          },
        ],
        ATTRIBUTE_ROWS,
      ),
    ).toThrow(/wormholeMaxJumpMass/);
    expect(() =>
      buildWormholeCodex(
        [{ id: 1, name: 'Unexpected name', attributes: B274_ATTRIBUTES }],
        ATTRIBUTE_ROWS,
      ),
    ).toThrow(/unexpected name/);
  });
});

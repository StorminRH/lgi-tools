import { expect, test } from 'vitest';
import type {
  TypedWormholeCodexEntry,
  WormholeCodexEntry,
} from './universe-assets';
import { indexWormholeCodex } from './wormhole-codex-index';

const C729_LOWEST: TypedWormholeCodexEntry = {
  code: 'C729',
  typeId: 56_026,
  farSide: false,
  totalMass: 1_000_000_000,
  maxJumpMass: 410_000_000,
  massRegen: 0,
  lifetimeMinutes: 720,
  sizeClass: 'L',
  targetClass: -1,
};
const C729_CLONE: TypedWormholeCodexEntry = { ...C729_LOWEST, typeId: 56_546 };
const B274: TypedWormholeCodexEntry = {
  code: 'B274',
  typeId: 30_647,
  farSide: false,
  totalMass: 2_000_000_000,
  maxJumpMass: 375_000_000,
  massRegen: 0,
  lifetimeMinutes: 1_440,
  sizeClass: 'L',
  targetClass: 7,
};
const K162: WormholeCodexEntry = { code: 'K162', typeId: 30_831, farSide: true };

test('resolves each clone cluster to its lowest typeId in any input order and lists codes once, sorted', () => {
  const entries = [K162, C729_CLONE, B274, C729_LOWEST];

  for (const order of [entries, entries.toReversed()]) {
    const index = indexWormholeCodex(order);
    expect(index.byCode('C729')).toBe(C729_LOWEST);
    expect(index.byCode('B274')).toBe(B274);
    expect(index.byCode('K162')).toBe(K162);
    expect(index.byCode('NOPE')).toBeNull();
    expect(index.codes).toEqual(['B274', 'C729', 'K162']);
    expect(index.conflictingCodes).toEqual(new Set());
  }

  const empty = indexWormholeCodex([]);
  expect(empty.codes).toEqual([]);
  expect(empty.byCode('C729')).toBeNull();
});

test('flags a code whose clones disagree on any attribute or on far side, in either order', () => {
  const drifts: readonly Partial<TypedWormholeCodexEntry>[] = [
    { totalMass: 2_000_000_000 },
    { maxJumpMass: 375_000_000 },
    { massRegen: 1 },
    { lifetimeMinutes: 960 },
    { sizeClass: 'XL' },
    { targetClass: 5 },
  ];
  for (const drift of drifts) {
    const drifted: TypedWormholeCodexEntry = { ...C729_CLONE, ...drift };
    for (const order of [[C729_LOWEST, drifted, B274], [B274, drifted, C729_LOWEST]]) {
      const index = indexWormholeCodex(order);
      expect(index.conflictingCodes).toEqual(new Set(['C729']));
      expect(index.byCode('C729')).toBe(C729_LOWEST);
      expect(index.byCode('B274')).toBe(B274);
    }
  }

  const typedK162: TypedWormholeCodexEntry = { ...C729_LOWEST, code: 'K162', typeId: 30_000 };
  for (const order of [[K162, typedK162], [typedK162, K162]]) {
    const index = indexWormholeCodex(order);
    expect(index.conflictingCodes).toEqual(new Set(['K162']));
    expect(index.byCode('K162')).toBe(typedK162);
  }
});

import { describe, expect, it } from 'vitest';
import { seatOrderedLayout } from '../chain/stub-layout';
import { compassKernel } from './compass';
import { deriveChainTree } from './facts';
import { DEFAULT_LAYOUT_CONFIG, type LayoutFacts } from './layout-contract';
import {
  chainPrefix,
  generateChainTimeline,
  movedSystems,
  PROOF_CORPUS,
  type ChainTimeline,
} from './proof-kit';

const A = 31_000_001;
const B = 31_000_002;
const C = 31_000_003;
const D = 31_000_004;
const E = 31_000_005;

const PROPORTIONAL = {
  ...DEFAULT_LAYOUT_CONFIG,
  wedgePolicy: 'proportional' as const,
  siblingSpread: 3,
};
const FIXED_SLOT = { ...DEFAULT_LAYOUT_CONFIG, wedgePolicy: 'fixed-slot' as const };

function facts(
  systemIds: readonly number[],
  connections: readonly (readonly [number, number])[],
): LayoutFacts {
  return {
    systems: systemIds.map((systemId) => ({ systemId })),
    connections: connections.map(([fromSystemId, toSystemId]) => ({
      fromSystemId,
      toSystemId,
    })),
  };
}

describe('leaf adds under the fixed-slot posture', () => {
  it('adding a deep leaf moves no existing node', async () => {
    const before = await compassKernel(facts([A, B, C], [[A, B], [B, C]]), FIXED_SLOT);
    const after = await compassKernel(facts([A, B, C, D], [[A, B], [B, C], [C, D]]), FIXED_SLOT);
    expect(movedSystems(before, after)).toEqual([]);
  });

  it('adding a new root child (claiming a fresh compass sector) moves no existing node', async () => {
    const before = await compassKernel(facts([A, B, C], [[A, B], [B, C]]), FIXED_SLOT);
    const after = await compassKernel(facts([A, B, C, D], [[A, B], [B, C], [A, D]]), FIXED_SLOT);
    expect(movedSystems(before, after)).toEqual([]);
  });

  it('growing a corpus-scale chain by one leaf moves no existing node', async () => {
    const base: (readonly [number, number])[] = [
      [A, B], [B, C], [C, D], [B, E],
      [A, 31_000_006], [31_000_006, 31_000_007], [31_000_007, 31_000_008],
      [A, 31_000_009], [31_000_009, 31_000_010], [D, 31_000_011],
    ];
    const ids = [A, B, C, D, E, 31_000_006, 31_000_007, 31_000_008, 31_000_009, 31_000_010, 31_000_011];
    const before = await compassKernel(facts(ids, base), FIXED_SLOT);
    const after = await compassKernel(
      facts([...ids, 31_000_012], [...base, [31_000_011, 31_000_012] as const]),
      FIXED_SLOT,
    );
    expect(movedSystems(before, after)).toEqual([]);
  });
});

describe('corpus-wide growth under the fixed-slot posture', () => {
  it('replays every corpus chain spawn by spawn: no attached node ever moves', async () => {
    for (const entry of PROOF_CORPUS) {
      const full = generateChainTimeline(entry);
      let beforeFacts = chainPrefix(full, 1);
      let before = await compassKernel(beforeFacts, FIXED_SLOT);
      for (let size = 2; size <= entry.size; size += 1) {
        const afterFacts = chainPrefix(full, size);
        const after = await compassKernel(afterFacts, FIXED_SLOT);
        const parked = new Set([
          ...deriveChainTree(beforeFacts).orphans,
          ...deriveChainTree(afterFacts).orphans,
        ]);
        const moved = movedSystems(before, after).filter(
          (systemId) => !parked.has(systemId),
        );
        expect(
          moved,
          `seed ${entry.seed} step ${size - 1}→${size} moved attached nodes`,
        ).toEqual([]);
        beforeFacts = afterFacts;
        before = after;
      }
    }
  });
});

function factsWithStubs(timeline: ChainTimeline, size: number): LayoutFacts {
  const prefix = chainPrefix(timeline, size);
  const rootId = prefix.systems[0]?.systemId ?? 31_000_001;
  return seatOrderedLayout({
    systems: prefix.systems,
    connections: prefix.connections.map((edge, index) => ({
      _id: `e${index}`,
      fromSystemId: edge.fromSystemId,
      toSystemId: edge.toSystemId,
      _creationTime: (timeline.connectionSteps[index] ?? size) * 10,
    })),
    stubRows: Array.from({ length: size }, (_, index) => ({
      connectionId: `stub-${index}`,
      fromSystemId: rootId,
      layoutSystemId: -(index + 1),
      _creationTime: (index + 1) * 10 + 1,
    })),
    slotHolders: [],
  }).facts;
}

describe('corpus replay with interleaved stub rows', () => {
  it('reports no attached node moves when stub rows append at every step', async () => {
    for (const entry of PROOF_CORPUS) {
      const full = generateChainTimeline(entry);
      let beforeFacts = factsWithStubs(full, 1);
      let before = await compassKernel(beforeFacts, FIXED_SLOT);
      for (let size = 2; size <= entry.size; size += 1) {
        const afterFacts = factsWithStubs(full, size);
        const after = await compassKernel(afterFacts, FIXED_SLOT);
        const parked = new Set([
          ...deriveChainTree(beforeFacts).orphans,
          ...deriveChainTree(afterFacts).orphans,
        ]);
        const moved = movedSystems(before, after).filter(
          (systemId) => !parked.has(systemId),
        );
        expect(
          moved,
          `seed ${entry.seed} step ${size - 1}→${size} moved attached nodes`,
        ).toEqual([]);
        beforeFacts = afterFacts;
        before = after;
      }
    }
  });
});

describe('sector fills', () => {
  it('filling a sector under the fixed-slot posture moves nothing at all', async () => {
    const before = await compassKernel(facts([A, B, C, E], [[A, B], [B, C], [C, E]]), FIXED_SLOT);
    const after = await compassKernel(
      facts([A, B, C, E, D], [[A, B], [B, C], [C, E], [B, D]]),
      FIXED_SLOT,
    );
    expect(movedSystems(before, after)).toEqual([]);
  });

  it('filling a sector under proportional re-spreads exactly the sibling group', async () => {
    const before = await compassKernel(facts([A, B, C], [[A, B], [B, C]]), PROPORTIONAL);
    const after = await compassKernel(
      facts([A, B, C, D], [[A, B], [B, C], [B, D]]),
      PROPORTIONAL,
    );
    expect(movedSystems(before, after)).toEqual([C]);
  });

  it('a proportional re-spread carries the sibling subtree and nothing outside it', async () => {
    const before = await compassKernel(
      facts([A, B, C, E], [[A, B], [B, C], [C, E]]),
      PROPORTIONAL,
    );
    const after = await compassKernel(
      facts([A, B, C, E, D], [[A, B], [B, C], [C, E], [B, D]]),
      PROPORTIONAL,
    );
    expect(movedSystems(before, after)).toEqual([C, E]);
  });

  it('a proportional first child appears without moving anything', async () => {
    const before = await compassKernel(facts([A, B], [[A, B]]), PROPORTIONAL);
    const after = await compassKernel(facts([A, B, C], [[A, B], [B, C]]), PROPORTIONAL);
    expect(movedSystems(before, after)).toEqual([]);
  });
});

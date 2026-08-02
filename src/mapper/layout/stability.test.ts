// Contract DC-3 (AC-2, V-1), as operator-relaxed in plan PD-3: spawn movement is a measured,
// configured behavior. Under the `fixed-slot` posture every add moves nothing; under
// `proportional` — the SHIPPED default since the integration session's G-1 ratification
// (2026-08-02) — a sector fill re-spreads exactly the affected sibling group and the subtrees
// riding on it. Both postures keep their exact moved-set guarantees gated here, each under its
// own explicit config.
import { describe, expect, it } from 'vitest';
import { compassKernel } from './compass';
import { deriveChainTree } from './facts';
import { DEFAULT_LAYOUT_CONFIG, type LayoutFacts } from './layout-contract';
import {
  chainPrefix,
  generateChainTimeline,
  movedSystems,
  PROOF_CORPUS,
} from './proof-kit';

const A = 31_000_001;
const B = 31_000_002;
const C = 31_000_003;
const D = 31_000_004;
const E = 31_000_005;

const PROPORTIONAL = { ...DEFAULT_LAYOUT_CONFIG, wedgePolicy: 'proportional' as const };
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
    // A 12-system branchy chain, then one more leaf on the deepest thread.
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
    // The stated exception (overflow.ts): parked orphans may shift within their cluster as
    // orphans attach or the cluster base steps outward. Systems parked in EITHER layout are
    // therefore excluded; every attached node must hold exactly still on every arrival.
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

describe('sector fills', () => {
  it('filling a sector under the fixed-slot posture moves nothing at all', async () => {
    // D becomes B's second child — the sector-fill case; fixed slots hold every sibling still.
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
    // Exactly C — B's only existing child re-centers; nothing outside the group moves.
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
    // Exactly C (the re-centered sibling) and E (riding on C); A and B hold.
    expect(movedSystems(before, after)).toEqual([C, E]);
  });

  it('a proportional first child appears without moving anything', async () => {
    const before = await compassKernel(facts([A, B], [[A, B]]), PROPORTIONAL);
    const after = await compassKernel(facts([A, B, C], [[A, B], [B, C]]), PROPORTIONAL);
    expect(movedSystems(before, after)).toEqual([]);
  });
});

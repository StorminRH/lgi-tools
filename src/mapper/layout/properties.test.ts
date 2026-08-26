// Contract DC-4 (AC-3, V-1): generated chains lay out with no node overlap, and edge crossings
// are confined to loop-closing connections. Both properties run over the full seeded corpus —
// adversarial 2-to-60-system chains with loops, duplicate scans, and orphan phases.
import { describe, expect, it } from 'vitest';
import { compassKernel } from './compass';
import { DEFAULT_LAYOUT_CONFIG, type LayoutFacts } from './layout-contract';
import {
  crossingReport,
  generateChain,
  PROOF_CORPUS,
  separationViolations,
} from './proof-kit';

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

describe(`generated-chain properties over the ${PROOF_CORPUS.length}-chain seeded corpus`, () => {
  it(`keeps every pairwise distance ≥ minSeparation (${DEFAULT_LAYOUT_CONFIG.minSeparation}) across all ${PROOF_CORPUS.length} corpus chains`, async () => {
    for (const entry of PROOF_CORPUS) {
      const chain = generateChain(entry);
      const positions = await compassKernel(chain, DEFAULT_LAYOUT_CONFIG);
      expect(positions.size).toBe(chain.systems.length);
      expect(
        separationViolations(positions, DEFAULT_LAYOUT_CONFIG.minSeparation),
        `seed ${entry.seed} n=${entry.size} produced overlapping nodes`,
      ).toEqual([]);
    }
  });

  it(`confines every edge crossing to loop-closing edges under the shipped default across all ${PROOF_CORPUS.length} corpus chains`, async () => {
    expect(DEFAULT_LAYOUT_CONFIG.wedgePolicy).toBe('fixed-slot');
    for (const entry of PROOF_CORPUS) {
      const chain = generateChain(entry);
      const positions = await compassKernel(chain, DEFAULT_LAYOUT_CONFIG);
      const report = crossingReport(chain, positions);
      expect(
        report.treeTreeCrossings,
        `seed ${entry.seed} n=${entry.size} crossed spanning-tree edges`,
      ).toBe(0);
    }
  });

  it('keeps a multi-orphan cluster clear of the gate, including its own internal spacing', async () => {
    // The corpus never parks two orphans at once, so the cluster's internal spacing is pinned
    // here: a chain plus three parked orphans (one pair linked to each other — a drawn edge
    // between unclassified systems) must clear minSeparation everywhere.
    const A = 31_000_001;
    const chain = facts(
      [A, 31_000_002, 31_000_003, 31_000_004, 31_000_005, 31_000_006],
      [
        [A, 31_000_002],
        [31_000_002, 31_000_003],
        [31_000_005, 31_000_006],
      ],
    );
    const positions = await compassKernel(chain, DEFAULT_LAYOUT_CONFIG);
    expect(positions.size).toBe(6);
    expect(separationViolations(positions, DEFAULT_LAYOUT_CONFIG.minSeparation)).toEqual([]);
    expect(crossingReport(chain, positions).treeTreeCrossings).toBe(0);
  });

  it('holds the overlap gate when the dials tighten below the compass defaults', async () => {
    // Ring-1 capacity must derive from separation, not just the compass count: a hostile config
    // (minSeparation near ringSpacing) forces root children past eight-slot ring 1 without
    // overlap. This is the invariant 4.0.3.1.2's dials inherit.
    const A = 31_000_001;
    const children = [2, 3, 4, 5, 6, 7].map((n) => 31_000_000 + n);
    const star = facts(
      [A, ...children],
      children.map((child) => [A, child] as const),
    );
    const tight = { ...DEFAULT_LAYOUT_CONFIG, ringSpacing: 220, minSeparation: 200 };
    const positions = await compassKernel(star, tight);
    expect(positions.size).toBe(7);
    expect(separationViolations(positions, tight.minSeparation)).toEqual([]);
  });
});

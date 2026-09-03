import { describe, expect, it } from 'vitest';
import type { ChainPosition } from '../chain/intents';
import { deriveChainTree } from './facts';
import { mulberry32 } from '../lib/prng';
import { segmentsIntersect } from './geometry';
import {
  chainPrefix,
  generateChain,
  generateChainTimeline,
  movedSystems,
  positionDigest,
  PROOF_CORPUS,
  separationViolations,
} from './proof-kit';

function point(x: number, y: number): ChainPosition {
  return { x, y };
}

describe('mulberry32', () => {
  it('replays the identical sequence for the identical seed', () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    const sequence = Array.from({ length: 20 }, () => first());
    expect(Array.from({ length: 20 }, () => second())).toEqual(sequence);
  });

  it('stays within [0, 1) and differs across seeds', () => {
    const rand = mulberry32(7);
    const values = Array.from({ length: 100 }, () => rand());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    const other = mulberry32(8);
    expect(Array.from({ length: 100 }, () => other())).not.toEqual(values);
  });
});

describe('generateChain', () => {
  it('produces a deterministic count and ascending creation order per corpus entry', () => {
    for (const entry of PROOF_CORPUS) {
      const facts = generateChain(entry);
      expect(facts).toEqual(generateChain(entry));
      expect(facts.systems).toHaveLength(entry.size);
      const ids = facts.systems.map((system) => system.systemId);
      expect([...ids].sort((a, b) => a - b)).toEqual(ids);
      expect(new Set(ids).size).toBe(entry.size);
    }
  });

  it('exercises loops across the corpus and orphan phases at meaningful sizes', () => {
    const trees = PROOF_CORPUS.map((entry) => deriveChainTree(generateChain(entry)));
    expect(trees.some((tree) => tree.loopEdges.length > 0)).toBe(true);

    expect(trees.some((tree) => tree.orphans.length > 0)).toBe(true);

    for (const entry of PROOF_CORPUS) {
      const facts = generateChain(entry);
      const known = new Set(facts.systems.map((system) => system.systemId));
      for (const edge of facts.connections) {
        expect(known.has(edge.fromSystemId)).toBe(true);
        expect(known.has(edge.toSystemId)).toBe(true);
      }
    }
  });
});

describe('chainPrefix', () => {
  it('keeps creation order and includes exactly the connections scanned by the prefix step', () => {
    const timeline = generateChainTimeline({ seed: 33, size: 50 });
    const prefix = chainPrefix(timeline, 20);
    expect(prefix.systems).toEqual(timeline.facts.systems.slice(0, 20));
    const included = new Set(prefix.systems.map((system) => system.systemId));
    for (const edge of prefix.connections) {
      expect(included.has(edge.fromSystemId)).toBe(true);
      expect(included.has(edge.toSystemId)).toBe(true);
    }

    const byStep = timeline.facts.connections.filter(
      (_edge, index) => (timeline.connectionSteps[index] ?? Number.POSITIVE_INFINITY) <= 20,
    );
    expect(prefix.connections).toEqual(byStep);
    expect(chainPrefix(timeline, 50)).toEqual(timeline.facts);
  });

  it('stamps every connection with a step no earlier than both endpoints exist', () => {
    const timeline = generateChainTimeline({ seed: 41, size: 60 });
    expect(timeline.connectionSteps).toHaveLength(timeline.facts.connections.length);
    for (const [index, edge] of timeline.facts.connections.entries()) {
      const step = timeline.connectionSteps[index] ?? 0;
      const fromRank = edge.fromSystemId - 31_000_000;
      const toRank = edge.toSystemId - 31_000_000;
      expect(step).toBeGreaterThanOrEqual(Math.max(fromRank, toRank));
      expect(step).toBeLessThanOrEqual(60);
    }
  });
});

describe('separationViolations', () => {
  it('reports exactly the pairs closer than the minimum', () => {
    const positions = new Map<number, ChainPosition>([
      [1, point(0, 0)],
      [2, point(100, 0)],
      [3, point(0, 300)],
    ]);
    const violations = separationViolations(positions, 140);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ a: 1, b: 2, distance: 100 });
  });

  it('reports nothing when every pair clears the minimum', () => {
    const positions = new Map<number, ChainPosition>([
      [1, point(0, 0)],
      [2, point(140, 0)],
      [3, point(0, 140)],
    ]);
    expect(separationViolations(positions, 140)).toEqual([]);
  });
});

describe('segmentsIntersect truth table', () => {
  it('detects a proper crossing', () => {
    expect(
      segmentsIntersect(point(0, 0), point(10, 10), point(0, 10), point(10, 0)),
    ).toBe(true);
  });

  it('rejects clearly separated segments', () => {
    expect(
      segmentsIntersect(point(0, 0), point(10, 0), point(0, 5), point(10, 5)),
    ).toBe(false);
  });

  it('rejects segments that only share an endpoint (tree edges at a node)', () => {
    expect(
      segmentsIntersect(point(0, 0), point(10, 0), point(10, 0), point(20, 10)),
    ).toBe(false);
  });

  it('detects a T-touch where one segment ends on the interior of another', () => {
    expect(
      segmentsIntersect(point(0, 0), point(10, 0), point(5, -5), point(5, 0)),
    ).toBe(true);
  });

  it('detects collinear overlap as a crossing', () => {
    expect(
      segmentsIntersect(point(0, 0), point(10, 0), point(5, 0), point(15, 0)),
    ).toBe(true);
  });

  it('rejects collinear segments that do not overlap', () => {
    expect(
      segmentsIntersect(point(0, 0), point(4, 0), point(6, 0), point(10, 0)),
    ).toBe(false);
  });
});

describe('movedSystems', () => {
  it('lists changed and vanished systems, ignoring additions', () => {
    const before = new Map<number, ChainPosition>([
      [1, point(0, 0)],
      [2, point(10, 0)],
      [3, point(20, 0)],
    ]);
    const after = new Map<number, ChainPosition>([
      [1, point(0, 0)],
      [2, point(10, 5)],
      [4, point(30, 0)],
    ]);
    expect(movedSystems(before, after)).toEqual([2, 3]);
  });
});

describe('positionDigest', () => {
  it('is independent of map insertion order', () => {
    const forward = new Map<number, ChainPosition>([
      [1, point(1.5, -2.25)],
      [2, point(3, 4)],
    ]);
    const reversed = new Map<number, ChainPosition>([
      [2, point(3, 4)],
      [1, point(1.5, -2.25)],
    ]);
    expect(positionDigest(forward)).toBe(positionDigest(reversed));
  });

  it('changes when any coordinate changes', () => {
    const base = new Map<number, ChainPosition>([[1, point(1, 1)]]);
    const nudged = new Map<number, ChainPosition>([[1, point(1, 1.0000001)]]);
    expect(positionDigest(base)).not.toBe(positionDigest(nudged));
  });
});

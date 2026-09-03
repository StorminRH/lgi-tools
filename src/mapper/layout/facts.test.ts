import { describe, expect, it } from 'vitest';
import { deriveChainTree } from './facts';
import type { LayoutFacts } from './layout-contract';

const A = 31_000_001;
const B = 31_000_002;
const C = 31_000_003;
const D = 31_000_004;
const E = 31_000_005;

function facts(
  systemIds: readonly number[],
  connections: readonly (readonly [number, number])[] = [],
  rootSystemId?: number,
): LayoutFacts {
  return {
    systems: systemIds.map((systemId) => ({ systemId })),
    connections: connections.map(([fromSystemId, toSystemId]) => ({
      fromSystemId,
      toSystemId,
    })),
    ...(rootSystemId === undefined ? {} : { rootSystemId }),
  };
}

describe('deriveChainTree root resolution', () => {
  it('defaults the root to the first system in creation order', () => {
    const tree = deriveChainTree(facts([B, A, C]));
    expect(tree.rootSystemId).toBe(B);
  });

  it('uses a rootSystemId override naming a present system as the derived root', () => {
    const tree = deriveChainTree(facts([A, B, C], [[A, B], [B, C]], C));
    expect(tree.rootSystemId).toBe(C);
    expect(tree.parents.get(B)).toBe(C);
    expect(tree.parents.get(A)).toBe(B);
  });

  it('ignores an override naming an absent system and applies the creation-order default', () => {
    const tree = deriveChainTree(facts([A, B], [[A, B]], D));
    expect(tree.rootSystemId).toBe(A);
    expect(tree.parents.get(B)).toBe(A);
  });

  it('returns the empty tree for empty facts', () => {
    const tree = deriveChainTree(facts([]));
    expect(tree.rootSystemId).toBeNull();
    expect(tree.parents.size).toBe(0);
    expect(tree.childrenInOrder.size).toBe(0);
    expect(tree.loopEdges).toEqual([]);
    expect(tree.orphans).toEqual([]);
  });

  it('places a single system as the root with nothing else derived', () => {
    const tree = deriveChainTree(facts([A]));
    expect(tree.rootSystemId).toBe(A);
    expect(tree.parents.size).toBe(0);
    expect(tree.orphans).toEqual([]);
  });
});

describe('deriveChainTree attachment and classification', () => {
  it('pinned single-pass diamond: immediate attachment feeds later edges in the same pass', () => {
    const tree = deriveChainTree(facts([A, B, C], [[A, C], [B, C], [A, B]]));
    expect(tree.rootSystemId).toBe(A);
    expect(tree.parents.get(C)).toBe(A);
    expect(tree.parents.get(B)).toBe(C);
    expect(tree.loopEdges).toEqual([{ fromSystemId: A, toSystemId: B }]);
  });

  it('pinned multi-pass: a skipped edge attaches on a later pass and stays a tree edge', () => {
    const tree = deriveChainTree(facts([A, B, C], [[B, C], [A, B]]));
    expect(tree.parents.get(B)).toBe(A);
    expect(tree.parents.get(C)).toBe(B);
    expect(tree.loopEdges).toEqual([]);
  });

  it('classifies a cycle-closing edge as loop-closing with zero positional influence', () => {
    const tree = deriveChainTree(facts([A, B, C], [[A, B], [B, C], [C, A]]));
    expect(tree.parents.get(B)).toBe(A);
    expect(tree.parents.get(C)).toBe(B);
    expect(tree.loopEdges).toEqual([{ fromSystemId: C, toSystemId: A }]);
    expect(tree.parents.has(A)).toBe(false);
  });

  it('classifies duplicate edges between one pair as loop-closing', () => {
    const tree = deriveChainTree(facts([A, B], [[A, B], [A, B], [B, A]]));
    expect(tree.parents.get(B)).toBe(A);
    expect(tree.loopEdges).toEqual([
      { fromSystemId: A, toSystemId: B },
      { fromSystemId: B, toSystemId: A },
    ]);
  });

  it('classifies self edges as loop-closing, including one arriving before its system attaches', () => {
    const tree = deriveChainTree(facts([A, B], [[B, B], [A, B]]));
    expect(tree.parents.get(B)).toBe(A);
    expect(tree.loopEdges).toEqual([{ fromSystemId: B, toSystemId: B }]);
  });

  it('records children in attachment order derived from creation-ordered edges', () => {
    const tree = deriveChainTree(
      facts([A, B, C, D, E], [[A, C], [A, B], [B, D], [A, E]]),
    );
    expect(tree.childrenInOrder.get(A)).toEqual([C, B, E]);
    expect(tree.childrenInOrder.get(B)).toEqual([D]);
    expect(tree.childrenInOrder.has(C)).toBe(false);
  });
});

describe('deriveChainTree growth stability (operator-settled replay, 2026-08-01)', () => {
  it('appending a leaf edge never reorders existing attachments, even in blocked histories', () => {
    const before = deriveChainTree(facts([A, B, C], [[B, C], [A, B]]));
    const after = deriveChainTree(facts([A, B, C, D], [[B, C], [A, B], [B, D]]));
    expect(before.attachmentOrder).toEqual([A, B, C]);
    expect(after.attachmentOrder).toEqual([A, B, C, D]);
    expect(after.childrenInOrder.get(B)).toEqual([C, D]);
  });

  it('a new connection joining two already-attached systems is loop-closing, never a reparent', () => {
    const before = deriveChainTree(facts([A, B, C], [[B, C], [A, B]]));
    const after = deriveChainTree(facts([A, B, C], [[B, C], [A, B], [A, C]]));
    expect(before.parents.get(C)).toBe(B);
    expect(after.parents.get(C)).toBe(B);
    expect(after.loopEdges).toEqual([{ fromSystemId: A, toSystemId: C }]);
  });

  it('every prefix of a history derives a strict prefix of the final attachment order', () => {
    const connections: (readonly [number, number])[] = [
      [C, E],
      [A, B],
      [B, C],
      [A, D],
    ];
    const ids = [A, B, C, D, E];
    let previous: readonly number[] = [];
    for (let count = 0; count <= connections.length; count += 1) {
      const tree = deriveChainTree(facts(ids, connections.slice(0, count)));
      expect(tree.attachmentOrder.slice(0, previous.length)).toEqual(previous);
      previous = tree.attachmentOrder;
    }
    expect(previous).toEqual([A, B, C, E, D]);
  });
});

describe('deriveChainTree orphans and unknown endpoints', () => {
  it('parks systems with no path to the root as orphans in creation order', () => {
    const tree = deriveChainTree(facts([A, D, B, C], [[A, B], [B, C]]));
    expect(tree.orphans).toEqual([D]);
  });

  it('keeps a disconnected pair orphaned even when linked to each other', () => {
    const tree = deriveChainTree(facts([A, C, D], [[C, D]]));
    expect(tree.orphans).toEqual([C, D]);
    expect(tree.loopEdges).toEqual([]);
    expect(tree.parents.size).toBe(0);
  });

  it('gives an edge naming an unknown system zero influence until the system arrives', () => {
    const before = deriveChainTree(facts([A], [[A, B]]));
    expect(before.parents.size).toBe(0);
    expect(before.loopEdges).toEqual([]);

    const after = deriveChainTree(facts([A, B], [[A, B]]));
    expect(after.parents.get(B)).toBe(A);
  });
});

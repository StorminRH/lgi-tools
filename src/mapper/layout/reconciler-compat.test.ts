// Pins the two facts the layout kernel's determinism story rides on, without touching the frozen
// 4.0.2.3 reconciler:
//
//   1. `reconcileChain` presents assigner candidates in synchronized creation order — retained
//      systems keep their arrival order, new arrivals append in snapshot order — across draining
//      pages, departures, and re-arrivals. The kernel's input order IS this order, so if this pin
//      breaks, identical maps could feed engines differently-ordered facts and D1/D2 fall.
//   2. Kernel-produced positions driven through a stub assigner — the exact adaptation
//      4.0.3.1.2's worker bridge performs — yield exact `system-appeared` / `system-moved`
//      intents from the unchanged `reconcileChain`.
import { describe, expect, it } from 'vitest';
import type { ChainPosition } from '../chain/intents';
import type { PlacementAssigner } from '../chain/placement';
import {
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainSnapshot,
  type ConnectionRow,
} from '../chain/reconciler';
import { compassKernel } from './compass';
import { DEFAULT_LAYOUT_CONFIG, type LayoutFacts } from './layout-contract';

const A = 31_000_001;
const B = 31_000_002;
const C = 31_000_003;
const D = 31_000_004;

const NO_DRAG: ReadonlySet<number> = new Set();

function snapshot(
  systemIds: readonly number[],
  connections: readonly ConnectionRow[] = [],
  complete: { systems?: boolean; connections?: boolean } = {},
): ChainSnapshot {
  return {
    systems: {
      rows: systemIds.map((systemId) => ({ systemId })),
      complete: complete.systems ?? true,
    },
    connections: {
      rows: connections,
      complete: complete.connections ?? true,
    },
  };
}

/** Records the candidate and connection order of every consultation while proposing nothing. */
function candidateOrderSpy(): {
  assigner: PlacementAssigner;
  consultations: number[][];
  connectionOrders: (readonly [number, number])[][];
} {
  const consultations: number[][] = [];
  const connectionOrders: (readonly [number, number])[][] = [];
  return {
    assigner: (input) => {
      consultations.push(input.systems.map((candidate) => candidate.systemId));
      connectionOrders.push(
        input.connections.map((edge) => [edge.fromSystemId, edge.toSystemId] as const),
      );
      return new Map();
    },
    consultations,
    connectionOrders,
  };
}

/** The worker-bridge adaptation: a resolved kernel result proposed as-is on every merge. */
function kernelResultAssigner(
  positions: ReadonlyMap<number, ChainPosition>,
): PlacementAssigner {
  return () => positions;
}

describe('reconcileChain candidate order (synchronized creation order)', () => {
  it('presents an initial complete snapshot in creation order', () => {
    const { assigner, consultations } = candidateOrderSpy();
    reconcileChain(EMPTY_CHAIN_STATE, snapshot([C, A, B]), NO_DRAG, assigner);
    expect(consultations).toEqual([[C, A, B]]);
  });

  it('keeps retained order and appends arrivals while pages drain', () => {
    const { assigner, consultations } = candidateOrderSpy();
    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([A, B], [], { systems: false }),
      NO_DRAG,
      assigner,
    );
    reconcileChain(first.state, snapshot([A, B, C, D]), NO_DRAG, assigner);
    expect(consultations).toEqual([
      [A, B],
      [A, B, C, D],
    ]);
  });

  it('preserves survivor order across a departure', () => {
    const { assigner, consultations } = candidateOrderSpy();
    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([A, B, C]),
      NO_DRAG,
      assigner,
    );
    reconcileChain(first.state, snapshot([A, C]), NO_DRAG, assigner);
    expect(consultations[1]).toEqual([A, C]);
  });

  it('appends a re-arrival at the end, matching its new creation time', () => {
    const { assigner, consultations } = candidateOrderSpy();
    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([A, B, C]),
      NO_DRAG,
      assigner,
    );
    const departed = reconcileChain(first.state, snapshot([A, C]), NO_DRAG, assigner);
    // A re-scanned wormhole is a new Convex document with a new creation time, so it arrives after
    // every retained system.
    reconcileChain(departed.state, snapshot([A, C, B]), NO_DRAG, assigner);
    expect(consultations[2]).toEqual([A, C, B]);
  });

  it('presents visible connections retained-then-snapshot while draining, snapshot-order once complete', () => {
    const { assigner, consultations, connectionOrders } = candidateOrderSpy();
    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot(
        [A, B, C],
        [
          { connectionId: 'e1', fromSystemId: A, toSystemId: B },
          { connectionId: 'e2', fromSystemId: B, toSystemId: C },
        ],
      ),
      NO_DRAG,
      assigner,
    );
    // A still-draining connections page: e2 is momentarily absent, e3 arrives; the retained e1/e2
    // survive additively ahead of the newly seen e3.
    const second = reconcileChain(
      first.state,
      snapshot(
        [A, B, C],
        [
          { connectionId: 'e1', fromSystemId: A, toSystemId: B },
          { connectionId: 'e3', fromSystemId: A, toSystemId: C },
        ],
        { connections: false },
      ),
      NO_DRAG,
      assigner,
    );
    // The complete page re-serves everything in snapshot (creation) order.
    reconcileChain(
      second.state,
      snapshot(
        [A, B, C],
        [
          { connectionId: 'e1', fromSystemId: A, toSystemId: B },
          { connectionId: 'e2', fromSystemId: B, toSystemId: C },
          { connectionId: 'e3', fromSystemId: A, toSystemId: C },
        ],
      ),
      NO_DRAG,
      assigner,
    );
    expect(consultations).toHaveLength(3);
    expect(connectionOrders[0]).toEqual([[A, B], [B, C]]);
    expect(connectionOrders[1]).toEqual([[A, B], [B, C], [A, C]]);
    expect(connectionOrders[2]).toEqual([[A, B], [B, C], [A, C]]);
  });

  it('holds every departure back while the systems collection is still draining', () => {
    const { assigner, consultations } = candidateOrderSpy();
    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([A, B, C]),
      NO_DRAG,
      assigner,
    );
    reconcileChain(
      first.state,
      snapshot([C], [], { systems: false }),
      NO_DRAG,
      assigner,
    );
    expect(consultations[1]).toEqual([A, B, C]);
  });
});

describe('reconcileChain driven by kernel-produced positions', () => {
  function factsOf(
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

  /** A position the kernel must have produced; fails loudly instead of yielding `undefined`. */
  function at(positions: ReadonlyMap<number, ChainPosition>, systemId: number): ChainPosition {
    const position = positions.get(systemId);
    if (position === undefined) throw new Error(`kernel omitted system ${systemId}`);
    return position;
  }

  const PROPORTIONAL = { ...DEFAULT_LAYOUT_CONFIG, wedgePolicy: 'proportional' as const };

  it('emits exact system-appeared intents at kernel positions on first appearance', async () => {
    const positions = await compassKernel(factsOf([A, B], [[A, B]]));
    const merge = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([A, B], [{ connectionId: 'e1', fromSystemId: A, toSystemId: B }]),
      NO_DRAG,
      kernelResultAssigner(positions),
    );
    expect(merge.intents).toEqual([
      { kind: 'system-appeared', systemId: A, position: at(positions, A) },
      { kind: 'system-appeared', systemId: B, position: at(positions, B) },
      {
        kind: 'connection-appeared',
        connectionId: 'e1',
        fromSystemId: A,
        toSystemId: B,
      },
    ]);
    expect(merge.state.systems.get(B)?.placementSource).toBe('assigner');
  });

  it('emits exact system-moved intents when a new kernel result repositions a node', async () => {
    // Under the proportional posture, D's arrival as B's second child re-centers the sibling
    // group, so the kernel's next result genuinely moves C — a real spawn-movement layout.
    const before = await compassKernel(factsOf([A, B, C], [[A, B], [B, C]]), PROPORTIONAL);
    const after = await compassKernel(
      factsOf([A, B, C, D], [[A, B], [B, C], [B, D]]),
      PROPORTIONAL,
    );
    expect(at(after, C)).not.toEqual(at(before, C));

    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([A, B, C]),
      NO_DRAG,
      kernelResultAssigner(before),
    );
    const merge = reconcileChain(
      first.state,
      snapshot([A, B, C, D]),
      NO_DRAG,
      kernelResultAssigner(after),
    );
    expect(merge.intents).toEqual([
      { kind: 'system-appeared', systemId: D, position: at(after, D) },
      {
        kind: 'system-moved',
        systemId: C,
        from: at(before, C),
        to: at(after, C),
      },
    ]);
    expect(merge.state.systems.get(A)?.position).toEqual(at(before, A));
    expect(merge.state.systems.get(B)?.position).toEqual(at(before, B));
  });

  it('never moves a protected node no matter what the kernel result proposes', async () => {
    const before = await compassKernel(factsOf([A, B, C], [[A, B], [B, C]]), PROPORTIONAL);
    const after = await compassKernel(
      factsOf([A, B, C, D], [[A, B], [B, C], [B, D]]),
      PROPORTIONAL,
    );
    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([A, B, C]),
      NO_DRAG,
      kernelResultAssigner(before),
    );
    const dragging = new Set([C]);
    const merge = reconcileChain(
      first.state,
      snapshot([A, B, C, D]),
      dragging,
      kernelResultAssigner(after),
    );
    expect(merge.state.systems.get(C)?.position).toEqual(at(before, C));
    expect(
      merge.intents.filter((intent) => intent.kind === 'system-moved'),
    ).toEqual([]);
  });
});

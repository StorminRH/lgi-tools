import { describe, expect, it } from 'vitest';
import {
  MAP_CHAIN_INTENT_KINDS,
  type ChainPosition,
  type MapChainIntent,
} from './intents';
import {
  gridAssigner,
  positionOfSlot,
  type PlacementAssigner,
} from './placement';
import {
  applyUserPlacement,
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainSnapshot,
  type ChainState,
  type ConnectionRow,
} from './reconciler';

const JITA = 30_000_142;
const AMARR = 30_002_187;
const DODIXIE = 30_002_659;

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

function link(
  connectionId: string,
  fromSystemId: number,
  toSystemId: number,
): ConnectionRow {
  return { connectionId, fromSystemId, toSystemId };
}

/** An assigner that parks everything on the grid but forces one node to a fixed spot. */
function assignerMoving(systemId: number, to: ChainPosition): PlacementAssigner {
  return (input) => {
    const proposals = new Map(gridAssigner(input));
    proposals.set(systemId, to);
    return proposals;
  };
}

/** Reconciles a sequence of snapshots from empty, returning every merge's intents. */
function replay(
  snapshots: readonly ChainSnapshot[],
  assigner: PlacementAssigner = gridAssigner,
): { state: ChainState; intents: readonly MapChainIntent[][] } {
  let state = EMPTY_CHAIN_STATE;
  const intents: MapChainIntent[][] = [];
  for (const next of snapshots) {
    const merge = reconcileChain(state, next, NO_DRAG, assigner);
    state = merge.state;
    intents.push([...merge.intents]);
  }
  return { state, intents };
}

function kindsOf(intents: readonly MapChainIntent[]): string[] {
  return intents.map((intent) => intent.kind);
}

describe('map chain reconciler', () => {
  // ── SC-7 · DC-7 / AC-7 / V-3 — the named intent vocabulary ────────────────
  describe('intents', () => {
    it('emits system-appeared carrying the assigned position', () => {
      const merge = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );

      expect(merge.intents).toEqual([
        { kind: 'system-appeared', systemId: JITA, position: positionOfSlot(0) },
      ]);
    });

    it('emits connection-appeared carrying both endpoints', () => {
      const { intents } = replay([
        snapshot([JITA, AMARR]),
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
      ]);

      expect(intents[1]).toEqual([
        {
          kind: 'connection-appeared',
          connectionId: 'c1',
          fromSystemId: JITA,
          toSystemId: AMARR,
        },
      ]);
    });

    it('emits system-departed for a system a complete snapshot dropped', () => {
      const { intents } = replay([snapshot([JITA, AMARR]), snapshot([JITA])]);

      expect(intents[1]).toEqual([{ kind: 'system-departed', systemId: AMARR }]);
    });

    it('emits connection-departed for a connection a complete snapshot dropped', () => {
      const { intents } = replay([
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        snapshot([JITA, AMARR], []),
      ]);

      expect(intents[1]).toEqual([
        { kind: 'connection-departed', connectionId: 'c1' },
      ]);
    });

    // The 4.0.3.1 hand-off: the grid never proposes a move, so the emission path is proven by
    // driving the seam directly. Without this the layout engine would inherit dead code.
    it('emits system-moved when the placement seam proposes a new position', () => {
      const target = { x: 999, y: 42 };
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );
      const second = reconcileChain(
        first.state,
        snapshot([JITA]),
        NO_DRAG,
        assignerMoving(JITA, target),
      );

      expect(second.intents).toEqual([
        {
          kind: 'system-moved',
          systemId: JITA,
          from: positionOfSlot(0),
          to: target,
        },
      ]);
      expect(second.state.systems.get(JITA)?.position).toEqual(target);
    });

    it('covers every declared intent kind across the suite scenarios', () => {
      const observed = new Set<string>();

      const arrive = replay([
        snapshot([JITA, AMARR]),
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        snapshot([JITA], []),
      ]);
      arrive.intents.flat().forEach((intent) => observed.add(intent.kind));

      const moved = reconcileChain(
        arrive.state,
        snapshot([JITA]),
        NO_DRAG,
        assignerMoving(JITA, { x: 7, y: 7 }),
      );
      kindsOf(moved.intents).forEach((kind) => observed.add(kind));

      expect([...observed].toSorted()).toEqual([...MAP_CHAIN_INTENT_KINDS].toSorted());
    });
  });

  // ── SC-1 · DC-1 / AC-1 / V-1 — arrivals and departures ───────────────────
  describe('arrivals and departures', () => {
    it('adds exactly one node for an added system row', () => {
      const { state, intents } = replay([snapshot([JITA]), snapshot([JITA, AMARR])]);

      expect(intents[1]).toHaveLength(1);
      expect(state.systems.size).toBe(2);
      expect([...state.systems.keys()]).toEqual([JITA, AMARR]);
    });

    it('adds exactly one edge for an added connection row', () => {
      const { state, intents } = replay([
        snapshot([JITA, AMARR]),
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
      ]);

      expect(intents[1]).toHaveLength(1);
      expect(state.connections.size).toBe(1);
    });

    it('removes the node when a complete snapshot drops it', () => {
      const { state } = replay([snapshot([JITA, AMARR]), snapshot([JITA])]);

      expect([...state.systems.keys()]).toEqual([JITA]);
    });

    it('never infers a departure from an incomplete systems snapshot', () => {
      const { state, intents } = replay([
        snapshot([JITA, AMARR]),
        snapshot([JITA], [], { systems: false }),
      ]);

      expect(intents[1]).toEqual([]);
      expect([...state.systems.keys()]).toEqual([JITA, AMARR]);
    });

    it('never infers a connection departure from an incomplete connections snapshot', () => {
      const { state, intents } = replay([
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        snapshot([JITA, AMARR], [], { connections: false }),
      ]);

      expect(intents[1]).toEqual([]);
      expect(state.connections.size).toBe(1);
    });
  });

  // ── Edges around endpoints that have not arrived ──────────────────────────
  describe('edge visibility', () => {
    it('withholds a connection whose endpoint is absent and emits no intent', () => {
      const merge = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA], [link('c1', JITA, AMARR)]),
        NO_DRAG,
        gridAssigner,
      );

      expect(merge.state.connections.size).toBe(0);
      expect(kindsOf(merge.intents)).toEqual(['system-appeared']);
    });

    it('emits connection-appeared only once the missing endpoint arrives', () => {
      const { state, intents } = replay([
        snapshot([JITA], [link('c1', JITA, AMARR)]),
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
      ]);

      expect(kindsOf(intents[1] ?? [])).toEqual([
        'system-appeared',
        'connection-appeared',
      ]);
      expect(state.connections.size).toBe(1);
    });

    it('departs an edge whose endpoint left while the document persists', () => {
      const { state, intents } = replay([
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        snapshot([JITA], [link('c1', JITA, AMARR)]),
      ]);

      expect(kindsOf(intents[1] ?? []).toSorted()).toEqual([
        'connection-departed',
        'system-departed',
      ]);
      expect(state.connections.size).toBe(0);
    });

    it('restores the edge when the endpoint returns', () => {
      const { state, intents } = replay([
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        snapshot([JITA], [link('c1', JITA, AMARR)]),
        snapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
      ]);

      expect(kindsOf(intents[2] ?? [])).toEqual([
        'system-appeared',
        'connection-appeared',
      ]);
      expect(state.connections.size).toBe(1);
    });
  });

  // ── SC-2 · DC-2 / AC-2 / HC-1 — the protection set is inviolable ──────────
  describe('protection', () => {
    it('leaves a user-placed node identical through an unrelated arrival', () => {
      const dragged = { x: 512, y: 64 };
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );
      const pinned = applyUserPlacement(first.state, JITA, dragged);

      const second = reconcileChain(
        pinned,
        snapshot([JITA, AMARR]),
        NO_DRAG,
        gridAssigner,
      );

      expect(second.state.systems.get(JITA)?.position).toEqual(dragged);
      expect(second.state.systems.get(JITA)?.placementSource).toBe('user');
      expect(kindsOf(second.intents)).toEqual(['system-appeared']);
    });

    it('never repositions a dragging node even when the assigner proposes one', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );

      const second = reconcileChain(
        first.state,
        snapshot([JITA]),
        new Set([JITA]),
        assignerMoving(JITA, { x: 1, y: 1 }),
      );

      expect(second.state.systems.get(JITA)?.position).toEqual(positionOfSlot(0));
      expect(second.intents).toEqual([]);
    });

    // Defence in depth: protection is derived from state, not only from the caller's argument, so a
    // caller that forgets a user-placed node still cannot move it (HC-1).
    it('never repositions a user-placed node the caller omitted from the drag set', () => {
      const dragged = { x: 300, y: 300 };
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );
      const pinned = applyUserPlacement(first.state, JITA, dragged);

      const second = reconcileChain(
        pinned,
        snapshot([JITA]),
        NO_DRAG,
        assignerMoving(JITA, { x: 9, y: 9 }),
      );

      expect(second.state.systems.get(JITA)?.position).toEqual(dragged);
      expect(second.intents).toEqual([]);
    });

    it('marks a protected candidate locked when offering it to the assigner', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );
      const seen: boolean[] = [];

      reconcileChain(
        first.state,
        snapshot([JITA]),
        new Set([JITA]),
        (input) => {
          seen.push(...input.systems.map((candidate) => candidate.locked));
          return gridAssigner(input);
        },
      );

      expect(seen).toEqual([true]);
    });
  });

  // ── Provisional placement determinism (PD-3) ─────────────────────────────
  describe('placement', () => {
    it('places identical arrival orders identically', () => {
      const runA = replay([snapshot([JITA]), snapshot([JITA, AMARR, DODIXIE])]);
      const runB = replay([snapshot([JITA]), snapshot([JITA, AMARR, DODIXIE])]);

      expect([...runA.state.systems.entries()]).toEqual([
        ...runB.state.systems.entries(),
      ]);
    });

    it('fills grid slots in row-major order as systems arrive', () => {
      const { state } = replay([snapshot([JITA, AMARR, DODIXIE])]);

      expect(state.systems.get(JITA)?.position).toEqual(positionOfSlot(0));
      expect(state.systems.get(AMARR)?.position).toEqual(positionOfSlot(1));
      expect(state.systems.get(DODIXIE)?.position).toEqual(positionOfSlot(2));
    });

    it('assigns the next free slot around an already-placed node', () => {
      const { state } = replay([snapshot([JITA]), snapshot([JITA, AMARR])]);

      expect(state.systems.get(JITA)?.position).toEqual(positionOfSlot(0));
      expect(state.systems.get(AMARR)?.position).toEqual(positionOfSlot(1));
    });

    it('falls back to the origin when an assigner declines to place a new node', () => {
      const merge = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        () => new Map(),
      );

      expect(merge.state.systems.get(JITA)?.position).toEqual({ x: 0, y: 0 });
    });

    it('keeps an existing position when an assigner omits an existing node', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );
      const second = reconcileChain(
        first.state,
        snapshot([JITA]),
        NO_DRAG,
        () => new Map(),
      );

      expect(second.state.systems.get(JITA)?.position).toEqual(positionOfSlot(0));
      expect(second.intents).toEqual([]);
    });
  });

  describe('user placement', () => {
    it('stamps the user source so the position is protected thereafter', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        gridAssigner,
      );

      const pinned = applyUserPlacement(first.state, JITA, { x: 5, y: 6 });

      expect(pinned.systems.get(JITA)).toEqual({
        systemId: JITA,
        position: { x: 5, y: 6 },
        placementSource: 'user',
      });
    });

    it('ignores an unknown system so a stale drag callback cannot invent a node', () => {
      const pinned = applyUserPlacement(EMPTY_CHAIN_STATE, JITA, { x: 1, y: 2 });

      expect(pinned).toBe(EMPTY_CHAIN_STATE);
      expect(pinned.systems.size).toBe(0);
    });
  });
});

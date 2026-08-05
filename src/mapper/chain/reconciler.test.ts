import { describe, expect, it } from 'vitest';
import {
  type ChainPosition,
  type MapChainIntent,
} from './intents';
import { type PlacementAssigner } from './placement';

/** Every intent kind — kept in the test for exhaustiveness coverage. */
const MAP_CHAIN_INTENT_KINDS = [
  'system-appeared',
  'system-departed',
  'system-moved',
  'connection-appeared',
  'connection-departed',
] as const satisfies readonly MapChainIntent['kind'][];

/** Test-only row park — production placement is the kernel via assignerFromPositions. */
function positionOfSlot(slot: number): ChainPosition {
  return { x: (slot % 6) * 220, y: Math.floor(slot / 6) * 160 };
}

const sequentialTestAssigner: PlacementAssigner = ({ systems }) => {
  const proposals = new Map<number, ChainPosition>();
  const occupied = new Set<number>();
  for (const candidate of systems) {
    if (candidate.position === null) continue;
    const column = candidate.position.x / 220;
    const row = candidate.position.y / 160;
    if (
      Number.isInteger(column) &&
      Number.isInteger(row) &&
      column >= 0 &&
      column < 6 &&
      row >= 0
    ) {
      occupied.add(row * 6 + column);
    }
  }
  let nextSlot = 0;
  for (const candidate of systems) {
    if (candidate.position !== null) {
      proposals.set(candidate.systemId, candidate.position);
      continue;
    }
    while (occupied.has(nextSlot)) nextSlot += 1;
    occupied.add(nextSlot);
    proposals.set(candidate.systemId, positionOfSlot(nextSlot));
  }
  return proposals;
};
import {
  applyUserPlacement,
  clearUserPlacements,
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
    const proposals = new Map(sequentialTestAssigner(input));
    proposals.set(systemId, to);
    return proposals;
  };
}

/** Reconciles a sequence of snapshots from empty, returning every merge's intents. */
function replay(
  snapshots: readonly ChainSnapshot[],
  assigner: PlacementAssigner = sequentialTestAssigner,
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
        sequentialTestAssigner,
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

    // SC-3.4 — optimistic temp-id → confirmed id on the same endpoints is an
    // in-place identity swap: one edge remains, no birth/death intent pair.
    it('suppresses connection intents when a same-merge id-swap shares endpoints', () => {
      const { state, intents } = replay([
        snapshot(
          [JITA, AMARR],
          [link('optimistic:mapConnections:c1', JITA, AMARR)],
        ),
        snapshot([JITA, AMARR], [link('confirmed:c1', JITA, AMARR)]),
      ]);

      expect(intents[1]).toEqual([]);
      expect([...state.connections.keys()]).toEqual(['confirmed:c1']);
      expect(state.connections.get('confirmed:c1')).toEqual(
        link('confirmed:c1', JITA, AMARR),
      );
    });

    it('keeps real same-endpoint replacement intents', () => {
      const { intents } = replay([
        snapshot([JITA, AMARR], [link('persisted:c1', JITA, AMARR)]),
        snapshot([JITA, AMARR], [link('persisted:c2', JITA, AMARR)]),
      ]);

      expect(intents[1]).toEqual([
        { kind: 'connection-departed', connectionId: 'persisted:c1' },
        {
          kind: 'connection-appeared',
          connectionId: 'persisted:c2',
          fromSystemId: JITA,
          toSystemId: AMARR,
        },
      ]);
    });

    it('updates one connection tombstone stage without birth/death intents', () => {
      const active = snapshot(
        [JITA, AMARR],
        [{ ...link('c1', JITA, AMARR), deletedAt: null, purgeAfter: null }],
      );
      const dying = snapshot(
        [JITA, AMARR],
        [{ ...link('c1', JITA, AMARR), deletedAt: 10, purgeAfter: 20 }],
      );
      const { state, intents } = replay([active, dying]);

      expect(intents[1]).toEqual([]);
      expect(state.connections.get('c1')).toMatchObject({
        deletedAt: 10,
        purgeAfter: 20,
      });
    });

    it('still emits a real connection appear when endpoints differ from a departure', () => {
      const { intents } = replay([
        snapshot([JITA, AMARR, DODIXIE], [link('c1', JITA, AMARR)]),
        snapshot(
          [JITA, AMARR, DODIXIE],
          [link('c2', JITA, DODIXIE)],
        ),
      ]);

      expect(intents[1]).toEqual([
        { kind: 'connection-departed', connectionId: 'c1' },
        {
          kind: 'connection-appeared',
          connectionId: 'c2',
          fromSystemId: JITA,
          toSystemId: DODIXIE,
        },
      ]);
    });

    it('does not suppress an optimistic departure whose endpoints differ from the appear', () => {
      const tempId = 'optimistic:mapConnections:swap-test';
      const { intents } = replay([
        snapshot([JITA, AMARR, DODIXIE], [link(tempId, JITA, AMARR)]),
        snapshot(
          [JITA, AMARR, DODIXIE],
          [link('c2', JITA, DODIXIE)],
        ),
      ]);

      // The departing id is optimistic, but the confirmed row's endpoints do
      // not match — this is a real departure plus a real appear, not a swap.
      expect(intents[1]).toEqual([
        { kind: 'connection-departed', connectionId: tempId },
        {
          kind: 'connection-appeared',
          connectionId: 'c2',
          fromSystemId: JITA,
          toSystemId: DODIXIE,
        },
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
        sequentialTestAssigner,
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
        sequentialTestAssigner,
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
        sequentialTestAssigner,
      );
      const pinned = applyUserPlacement(first.state, JITA, dragged);

      const second = reconcileChain(
        pinned,
        snapshot([JITA, AMARR]),
        NO_DRAG,
        sequentialTestAssigner,
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
        sequentialTestAssigner,
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
        sequentialTestAssigner,
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
        sequentialTestAssigner,
      );
      const seen: boolean[] = [];

      reconcileChain(
        first.state,
        snapshot([JITA]),
        new Set([JITA]),
        (input) => {
          seen.push(...input.systems.map((candidate) => candidate.locked));
          return sequentialTestAssigner(input);
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
        sequentialTestAssigner,
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
        sequentialTestAssigner,
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

    it('keeps a user-stamped node unmoved while new systems arrive', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        sequentialTestAssigner,
      );
      const pinned = applyUserPlacement(first.state, JITA, { x: 50, y: 60 });
      const grown = reconcileChain(
        pinned,
        snapshot([JITA, AMARR]),
        NO_DRAG,
        assignerMoving(JITA, { x: 999, y: 999 }),
      );

      expect(grown.state.systems.get(JITA)).toEqual({
        systemId: JITA,
        position: { x: 50, y: 60 },
        placementSource: 'user',
      });
      expect(grown.state.systems.get(AMARR)?.placementSource).toBe('assigner');
    });

    it('clearUserPlacements reverts ownership without moving anything', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA, AMARR]),
        NO_DRAG,
        sequentialTestAssigner,
      );
      const pinned = applyUserPlacement(first.state, JITA, { x: 11, y: 22 });
      const cleared = clearUserPlacements(pinned);

      expect(cleared.systems.get(JITA)).toEqual({
        systemId: JITA,
        position: { x: 11, y: 22 },
        placementSource: 'assigner',
      });
      expect(cleared.systems.get(AMARR)).toEqual(first.state.systems.get(AMARR));
    });

    it('returns the same state when nothing was hand-placed', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        sequentialTestAssigner,
      );
      expect(clearUserPlacements(first.state)).toBe(first.state);
    });

    it('forced re-lock merge emits system-moved back to the kernel position', () => {
      const first = reconcileChain(
        EMPTY_CHAIN_STATE,
        snapshot([JITA]),
        NO_DRAG,
        sequentialTestAssigner,
      );
      const pinned = applyUserPlacement(first.state, JITA, { x: 11, y: 22 });
      const cleared = clearUserPlacements(pinned);
      const home = { x: 0, y: 0 };
      const relocked = reconcileChain(
        cleared,
        snapshot([JITA]),
        NO_DRAG,
        assignerMoving(JITA, home),
      );

      expect(relocked.state.systems.get(JITA)).toEqual({
        systemId: JITA,
        position: home,
        placementSource: 'assigner',
      });
      expect(relocked.intents).toEqual([
        {
          kind: 'system-moved',
          systemId: JITA,
          from: { x: 11, y: 22 },
          to: home,
        },
      ]);
    });
  });
});

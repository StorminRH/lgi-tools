import { describe, expect, it } from 'vitest';
import type { ChainNode } from '../canvas/SystemNode';
import { deriveChainTree } from '../layout/facts';
import type { SystemLabel } from './labels';
import { buildEdges, syncNodes } from './nodes';
import {
  applyUserPlacement,
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainSnapshot,
  type ChainState,
} from './reconciler';
import { type PlacementAssigner } from './placement';

function positionOfSlot(slot: number) {
  return { x: (slot % 6) * 220, y: Math.floor(slot / 6) * 160 };
}

const sequentialTestAssigner: PlacementAssigner = ({ systems }) => {
  const proposals = new Map<number, ReturnType<typeof positionOfSlot>>();
  let next = 0;
  for (const candidate of systems) {
    if (candidate.position !== null) {
      proposals.set(candidate.systemId, candidate.position);
    } else {
      proposals.set(candidate.systemId, positionOfSlot(next));
      next += 1;
    }
  }
  return proposals;
};

const JITA = 30_000_142;
const AMARR = 30_002_187;
const NO_DRAG: ReadonlySet<number> = new Set();

const fallbackLabel = (systemId: number): SystemLabel => ({
  name: String(systemId),
  className: null,
});

const namedLabel = (systemId: number): SystemLabel =>
  systemId === JITA
    ? { name: 'Jita', className: null }
    : { name: 'J123456', className: 'C5' };

function snapshot(systemIds: readonly number[], connections: ChainSnapshot['connections']['rows'] = []): ChainSnapshot {
  return {
    systems: { rows: systemIds.map((systemId) => ({ systemId })), complete: true },
    connections: { rows: connections, complete: true },
  };
}

function stateFor(systemIds: readonly number[]): ChainState {
  return reconcileChain(EMPTY_CHAIN_STATE, snapshot(systemIds), NO_DRAG, sequentialTestAssigner)
    .state;
}

describe('canvas node projection', () => {
  it('projects one node per reconciled system with its label', () => {
    const nodes = syncNodes([], stateFor([JITA, AMARR]).systems, namedLabel, NO_DRAG);

    expect(nodes).toEqual([
      {
        id: String(JITA),
        type: 'chainSystem',
        width: 120,
        height: 88,
        position: positionOfSlot(0),
        style: { pointerEvents: 'none' },
        data: {
          name: 'Jita',
          className: null,
          security: null,
          whClassId: null,
        },
      },
      {
        id: String(AMARR),
        type: 'chainSystem',
        width: 120,
        height: 88,
        position: positionOfSlot(1),
        style: { pointerEvents: 'none' },
        data: {
          name: 'J123456',
          className: 'C5',
          security: null,
          whClassId: null,
        },
      },
    ]);
  });

  it('drops a node the reconciler no longer holds', () => {
    const before = syncNodes([], stateFor([JITA, AMARR]).systems, fallbackLabel, NO_DRAG);
    const after = syncNodes(before, stateFor([JITA]).systems, fallbackLabel, NO_DRAG);

    expect(after.map((node) => node.id)).toEqual([String(JITA)]);
  });

  // SC-2 · DC-2 — the drag-protection rule, as a unit test rather than an observation.
  it('keeps a dragging node’s live position through an incoming update', () => {
    const pointer = { x: 777, y: 111 };
    const state = stateFor([JITA]);
    const dragged: ChainNode[] = [
      {
        id: String(JITA),
        type: 'chainSystem',
        position: pointer,
        data: { name: 'Jita', className: null },
      },
    ];

    // An unrelated system arrives mid-drag.
    const after = syncNodes(
      dragged,
      stateFor([JITA, AMARR]).systems,
      fallbackLabel,
      new Set([JITA]),
    );

    expect(after.find((node) => node.id === String(JITA))?.position).toEqual(pointer);
    expect(state.systems.get(JITA)?.position).toEqual(positionOfSlot(0));
  });

  it('takes the reconciled position once the drag has ended', () => {
    // The reconciled position deliberately differs from the stale local one, so this passes only
    // through the reconciled branch — with identical values either branch would satisfy it.
    const stale = { x: 777, y: 111 };
    const dropped = { x: 900, y: 250 };
    const dragged: ChainNode[] = [
      {
        id: String(JITA),
        type: 'chainSystem',
        position: stale,
        data: { name: 'Jita', className: null },
      },
    ];
    const pinned = applyUserPlacement(stateFor([JITA]), JITA, dropped);

    const after = syncNodes(dragged, pinned.systems, fallbackLabel, NO_DRAG);

    expect(after[0]?.position).toEqual(dropped);
  });

  // SC-3 — a late directory load relabels in place without touching positions.
  it('relabels in place when the directory arrives late', () => {
    const state = stateFor([JITA]);
    const before = syncNodes([], state.systems, fallbackLabel, NO_DRAG);
    const after = syncNodes(before, state.systems, namedLabel, NO_DRAG);

    expect(before[0]?.data).toEqual({
      name: String(JITA),
      className: null,
      security: null,
      whClassId: null,
    });
    expect(after[0]?.data).toEqual({
      name: 'Jita',
      className: null,
      security: null,
      whClassId: null,
    });
    expect(after[0]?.position).toEqual(before[0]?.position);
  });
});

describe('canvas edge projection', () => {
  it('projects one edge per visible connection', () => {
    const state = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([JITA, AMARR], [
        { connectionId: 'c1', fromSystemId: JITA, toSystemId: AMARR },
      ]),
      NO_DRAG,
      sequentialTestAssigner,
    ).state;

    expect(buildEdges(state.connections, new Map([[AMARR, JITA]]))).toEqual([
      {
        id: 'c1',
        source: String(JITA),
        target: String(AMARR),
        data: { loop: false, tombstoneState: 'active' },
      },
    ]);
  });

  it('renders dying ties but keeps skeleton ties out of the canvas', () => {
    const now = 1_700_000_000_000;
    const state = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([JITA, AMARR], [
        {
          connectionId: 'dying',
          fromSystemId: JITA,
          toSystemId: AMARR,
          deletedAt: now - 1,
          purgeAfter: now + 1,
        },
        {
          connectionId: 'skeleton',
          fromSystemId: JITA,
          toSystemId: AMARR,
          deletedAt: now - 2,
          purgeAfter: null,
        },
      ]),
      NO_DRAG,
      sequentialTestAssigner,
    ).state;

    const positionsBefore = [...state.systems.values()].map((row) => row.position);
    expect(buildEdges(state.connections, new Map([[AMARR, JITA]]), now)).toEqual([
      {
        id: 'dying',
        source: String(JITA),
        target: String(AMARR),
        data: { loop: false, tombstoneState: 'dying' },
      },
    ]);
    expect(
      buildEdges(state.connections, new Map([[AMARR, JITA]]), now + 2),
    ).toEqual([]);
    expect([...state.systems.values()].map((row) => row.position)).toEqual(
      positionsBefore,
    );
    expect(state.connections.has('skeleton')).toBe(true);
  });

  it('projects nothing for a withheld connection', () => {
    const state = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([JITA], [
        { connectionId: 'c1', fromSystemId: JITA, toSystemId: AMARR },
      ]),
      NO_DRAG,
      sequentialTestAssigner,
    ).state;

    expect(buildEdges(state.connections, new Map())).toEqual([]);
  });

  it('classifies tree links solid and loop closures dashed, once per pair', () => {
    const DODIXIE = 30002659;
    const state = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([JITA, AMARR, DODIXIE], [
        { connectionId: 'c1', fromSystemId: JITA, toSystemId: AMARR },
        { connectionId: 'c2', fromSystemId: AMARR, toSystemId: DODIXIE },
        // A loop closure back to the root, and a duplicate of a tree pair.
        { connectionId: 'c3', fromSystemId: DODIXIE, toSystemId: JITA },
        { connectionId: 'c4', fromSystemId: AMARR, toSystemId: JITA },
      ]),
      NO_DRAG,
      sequentialTestAssigner,
    ).state;
    // Derived by the kernel's own function on the same facts, not hand-built —
    // binding the canvas classification to the derivation it claims to follow.
    const treeParents = deriveChainTree({
      systems: [JITA, AMARR, DODIXIE].map((systemId) => ({ systemId })),
      connections: [
        { fromSystemId: JITA, toSystemId: AMARR },
        { fromSystemId: AMARR, toSystemId: DODIXIE },
        { fromSystemId: DODIXIE, toSystemId: JITA },
        { fromSystemId: AMARR, toSystemId: JITA },
      ],
    }).parents;

    expect(
      buildEdges(state.connections, treeParents).map((edge) => [edge.id, edge.data.loop]),
    ).toEqual([
      ['c1', false],
      ['c2', false],
      ['c3', true],
      ['c4', true],
    ]);
  });
});

// ── OW3 (4.0.4.2.3) — derived halo systems merged into the canvas ────────────

const RING1 = 30_000_144;
const RING3 = 30_000_139;

const placedHalo = (fogged: boolean, systemId: number = fogged ? RING3 : RING1) => ({
  systemId,
  ring: fogged ? 3 : 1,
  fogged,
  position: { x: 500, y: 500 },
});

describe('halo node projection', () => {
  it('appends kernel-owned halo nodes: declared frame, never draggable, fogged ring inert', () => {
    const nodes = syncNodes([], stateFor([JITA]).systems, fallbackLabel, NO_DRAG, [
      placedHalo(false),
      placedHalo(true),
    ]);

    expect(nodes.map((node) => node.id)).toEqual(
      [JITA, RING1, RING3].map(String),
    );
    const drawn = nodes[1];
    expect(drawn).toMatchObject({
      width: 120,
      height: 88,
      position: { x: 500, y: 500 },
      draggable: false,
      data: { halo: { ring: 1, fogged: false } },
    });
    expect(drawn?.selectable).toBeUndefined();
    // Every wrapper is pointer-inert; the visible chrome re-enables its own
    // pointer events inside SystemNode (fogged/ghost chrome never does).
    expect(drawn?.style).toEqual({ pointerEvents: 'none' });
    const fogged = nodes[2];
    expect(fogged).toMatchObject({
      draggable: false,
      selectable: false,
      selected: false,
      style: { pointerEvents: 'none' },
      data: { halo: { ring: 3, fogged: true } },
    });
  });

  it('retains selection for a drawn halo node across merges', () => {
    const before = syncNodes([], stateFor([JITA]).systems, fallbackLabel, NO_DRAG, [
      placedHalo(false),
    ]);
    const selected = before.map((node) =>
      node.id === String(RING1) ? { ...node, selected: true } : node,
    );
    const after = syncNodes(selected, stateFor([JITA]).systems, fallbackLabel, NO_DRAG, [
      placedHalo(false),
    ]);
    expect(after.find((node) => node.id === String(RING1))?.selected).toBe(true);
  });

  it('upgrades a halo node in place when its system becomes authored, shedding derived controls', () => {
    const before = syncNodes([], stateFor([JITA]).systems, fallbackLabel, NO_DRAG, [
      placedHalo(true, RING1),
    ]);
    // The jump lands: the same id is now reconciled truth and out of the halo.
    const after = syncNodes(before, stateFor([JITA, RING1]).systems, fallbackLabel, NO_DRAG, []);

    expect(after.filter((node) => node.id === String(RING1))).toHaveLength(1);
    const upgraded = after.find((node) => node.id === String(RING1));
    expect(upgraded?.data.halo).toBeUndefined();
    expect(upgraded?.draggable).toBeUndefined();
    expect(upgraded?.selectable).toBeUndefined();
    // The wrapper stays pointer-inert after the upgrade: interactivity comes
    // from the chrome, which re-enables once the halo/fogged markers drop.
    expect(upgraded?.style).toEqual({ pointerEvents: 'none' });
  });

  it('never renders a halo entry whose id is already reconciled (no duplicate mid-window)', () => {
    const nodes = syncNodes([], stateFor([JITA, RING1]).systems, fallbackLabel, NO_DRAG, [
      placedHalo(false, RING1),
    ]);
    expect(nodes.filter((node) => node.id === String(RING1))).toHaveLength(1);
    expect(nodes.find((node) => node.id === String(RING1))?.data.halo).toBeUndefined();
  });
});

describe('halo edge projection', () => {
  it('appends prefixed halo links sharing the pair-claiming, skipping authored pairs', () => {
    const state = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([JITA, AMARR], [
        { connectionId: 'c1', fromSystemId: JITA, toSystemId: AMARR },
      ]),
      NO_DRAG,
      sequentialTestAssigner,
    ).state;
    const treeParents = deriveChainTree({
      systems: [{ systemId: JITA }, { systemId: AMARR }, { systemId: RING1 }, { systemId: RING3 }],
      connections: [
        { fromSystemId: JITA, toSystemId: AMARR },
        { fromSystemId: JITA, toSystemId: RING1 },
        { fromSystemId: RING1, toSystemId: RING3 },
      ],
    }).parents;

    const edges = buildEdges(state.connections, treeParents, Date.now(), [
      // An authored line already spans this pair: contributes nothing.
      { a: JITA, b: AMARR },
      // Claim link to a ring-1 system: a tree link, drawn solid.
      { a: JITA, b: RING1 },
      // Onward claim link, and a non-tree cross-link.
      { a: RING1, b: RING3 },
      { a: AMARR, b: RING1 },
    ]);

    expect(edges.map((edge) => [edge.id, edge.data.loop, edge.data.halo])).toEqual([
      ['c1', false, undefined],
      [`halo:${JITA}>${RING1}`, false, true],
      [`halo:${RING1}>${RING3}`, false, true],
      [`halo:${AMARR}>${RING1}`, true, true],
    ]);
  });

  it('marks the one fogged side and omits links whose two endpoints are fogged (OW4)', () => {
    const treeParents = deriveChainTree({
      systems: [{ systemId: JITA }, { systemId: RING1 }, { systemId: RING3 }],
      connections: [
        { fromSystemId: JITA, toSystemId: RING1 },
        { fromSystemId: RING1, toSystemId: RING3 },
      ],
    }).parents;

    const edges = buildEdges(
      new Map(),
      treeParents,
      Date.now(),
      [
        { a: JITA, b: RING1 },
        { a: RING1, b: RING3 },
        { a: RING3, b: JITA },
      ],
      new Set([RING1, RING3]),
    );

    expect(edges.map((edge) => [edge.id, edge.data.fogSide])).toEqual([
      [`halo:${JITA}>${RING1}`, 'target'],
      [`halo:${RING3}>${JITA}`, 'source'],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
  type ChainNode,
} from '../canvas/SystemNode';
import { deriveChainTree } from '../layout/facts';
import type { SystemLabel } from './labels';
import {
  buildEdges,
  planStubNodes,
  STATIC_STUB_EDGE_ID_PREFIX,
  STATIC_STUB_NODE_ID_PREFIX,
  STUB_NODE_ID_PREFIX,
  stubNodeId,
  syncNodes,
  type PlacedStub,
  type PlacedStubConnection,
} from './nodes';
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
        width: SYSTEM_FRAME_WIDTH,
        height: SYSTEM_FRAME_HEIGHT,
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
        width: SYSTEM_FRAME_WIDTH,
        height: SYSTEM_FRAME_HEIGHT,
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

  it('hides a dying corpse when a live line already spans the same pair', () => {
    const now = 1_700_000_000_000;
    const state = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([JITA, AMARR], [
        {
          connectionId: 'live',
          fromSystemId: JITA,
          toSystemId: AMARR,
        },
        {
          connectionId: 'dying',
          fromSystemId: JITA,
          toSystemId: AMARR,
          deletedAt: now - 1,
          purgeAfter: now + 1,
        },
      ]),
      NO_DRAG,
      sequentialTestAssigner,
    ).state;

    expect(buildEdges(state.connections, new Map([[AMARR, JITA]]), now)).toEqual([
      {
        id: 'live',
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
        { connectionId: 'c3', fromSystemId: DODIXIE, toSystemId: JITA },
        { connectionId: 'c4', fromSystemId: AMARR, toSystemId: JITA },
      ]),
      NO_DRAG,
      sequentialTestAssigner,
    ).state;
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
      width: SYSTEM_FRAME_WIDTH,
      height: SYSTEM_FRAME_HEIGHT,
      position: { x: 500, y: 500 },
      draggable: false,
      data: { halo: { ring: 1, fogged: false } },
    });
    expect(drawn?.selectable).toBeUndefined();
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
    const after = syncNodes(before, stateFor([JITA, RING1]).systems, fallbackLabel, NO_DRAG, []);

    expect(after.filter((node) => node.id === String(RING1))).toHaveLength(1);
    const upgraded = after.find((node) => node.id === String(RING1));
    expect(upgraded?.data.halo).toBeUndefined();
    expect(upgraded?.draggable).toBeUndefined();
    expect(upgraded?.selectable).toBeUndefined();
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
      { a: JITA, b: AMARR },
      { a: JITA, b: RING1 },
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

const placedStub = (
  overrides: Partial<PlacedStubConnection> = {},
): PlacedStubConnection => ({
  connectionId: 'stub-connection',
  fromSystemId: JITA,
  signatureId: 'ABC-123',
  wormholeTypeCode: null,
  whClassId: null,
  position: { x: 300, y: 0 },
  ...overrides,
});

describe('wormhole stub projection', () => {
  it('spawns one inert stub, retires it on resolve, and renders nothing without input', () => {
    const state = stateFor([JITA]);
    const stub = placedStub();
    const nodes = syncNodes(
      [],
      state.systems,
      fallbackLabel,
      NO_DRAG,
      [],
      [stub],
    );

    expect(nodes.map((node) => node.id)).toEqual([
      String(JITA),
      `${STUB_NODE_ID_PREFIX}${stub.connectionId}`,
    ]);
    expect(nodes[1]).toMatchObject({
      position: { x: 300, y: 0 },
      draggable: false,
      selectable: false,
      selected: false,
      connectable: false,
      focusable: false,
      style: { pointerEvents: 'none' },
      data: {
        name: 'ABC-123',
        className: null,
        destinationHint: null,
        stub: {
          connectionId: 'stub-connection',
          fromSystemId: JITA,
          signatureId: 'ABC-123',
        },
      },
    });
    expect(buildEdges(state.connections, new Map(), Date.now(), [], new Set(), [stub]))
      .toEqual([
        {
          id: 'stub-connection',
          source: String(JITA),
          target: `${STUB_NODE_ID_PREFIX}stub-connection`,
          data: { loop: false, tombstoneState: 'active', stub: true },
        },
      ]);

    const before = nodes;
    const resolved = stateFor([JITA, AMARR]);
    const after = syncNodes(
      before,
      resolved.systems,
      fallbackLabel,
      NO_DRAG,
    );
    expect(after.filter((node) => node.id === String(AMARR))).toHaveLength(1);
    expect(after.some((node) => node.id.startsWith(STUB_NODE_ID_PREFIX))).toBe(false);

    expect(
      syncNodes([], stateFor([JITA]).systems, fallbackLabel, NO_DRAG, [], [])
        .map((node) => node.id),
    ).toEqual([String(JITA)]);
  });
});

const SYSTEM_STATICS = [
  { id: `${JITA}:B274:1`, code: 'B274', className: 'HS', whClassId: 7 },
  { id: `${JITA}:H296:1`, code: 'H296', className: 'C5', whClassId: 5 },
];

function placePlannedStubs(
  planned: ReturnType<typeof planStubNodes>,
): readonly PlacedStub[] {
  return planned.map((stub, index) => ({
    ...stub,
    position: { x: 300 + index * 180, y: 0 },
  }));
}

describe('static wormhole stub projection', () => {
  it('renders exactly the believed-holes plan for the two-statics/four-sigs case', () => {
    const signatures = ['AAA-111', 'BBB-222', 'CCC-333', 'DDD-444'].map(
      (signatureId) => ({
        connectionId: `connection-${signatureId}`,
        fromSystemId: JITA,
        signatureId,
        wormholeTypeCode: null,
        whClassId: null,
      }),
    );
    const planned = planStubNodes({
      systemIds: [JITA],
      signatures,
      connections: [],
      staticsBySystem: new Map([[JITA, SYSTEM_STATICS]]),
      rootSystemId: JITA,
    });
    const placed = placePlannedStubs(planned);
    const nodes = syncNodes(
      [],
      stateFor([JITA]).systems,
      fallbackLabel,
      NO_DRAG,
      [],
      placed,
    );

    expect(nodes.slice(1).map((node) => node.id)).toEqual(
      placed.map(stubNodeId),
    );
    expect(nodes.slice(1).map((node) => node.data.name)).toEqual([
      'CCC-333',
      'DDD-444',
      'B274',
      'H296',
    ]);
    expect(nodes.slice(1).map((node) => node.data.whClassId)).toEqual([
      null,
      null,
      7,
      5,
    ]);
    expect(nodes.filter((node) => node.id.startsWith(STATIC_STUB_NODE_ID_PREFIX)))
      .toHaveLength(2);
  });

  it('replaces a matching static with a code-carrying line and restores it after collapse', () => {
    const liveConnection = {
      fromSystemId: JITA,
      toSystemId: AMARR,
      from: {
        typeCode: 'B274',
        signatureId: 'ABC-123',
        signalPct: null,
        leadsTo: { kind: 'unset' as const },
      },
      to: {
        typeCode: 'K162',
        signatureId: null,
        signalPct: null,
        leadsTo: { kind: 'unset' as const },
      },
      tombstone: { kind: 'live' as const },
    };
    const input = {
      systemIds: [JITA],
      signatures: [],
      staticsBySystem: new Map([[JITA, SYSTEM_STATICS]]),
      rootSystemId: JITA,
    };
    const matched = placePlannedStubs(planStubNodes({
      ...input,
      connections: [liveConnection],
    }));
    expect(matched.map(stubNodeId)).toEqual([
      `${STATIC_STUB_NODE_ID_PREFIX}${JITA}:H296:1`,
    ]);

    const collapsed = placePlannedStubs(planStubNodes({
      ...input,
      connections: [{
        ...liveConnection,
        tombstone: { kind: 'removed' as const, deletedAt: 1, purgeAfter: null },
      }],
    }));
    expect(collapsed.map(stubNodeId)).toEqual([
      `${STATIC_STUB_NODE_ID_PREFIX}${JITA}:B274:1`,
      `${STATIC_STUB_NODE_ID_PREFIX}${JITA}:H296:1`,
    ]);
    expect(
      buildEdges(new Map(), new Map(), Date.now(), [], new Set(), collapsed)
        .map((edge) => edge.id),
    ).toEqual([
      `${STATIC_STUB_EDGE_ID_PREFIX}${JITA}:B274:1`,
      `${STATIC_STUB_EDGE_ID_PREFIX}${JITA}:H296:1`,
    ]);
  });

  it('renders zero static ghosts in degraded mode while preserving the pasted stub', () => {
    const placed = placePlannedStubs(planStubNodes({
      systemIds: [JITA],
      signatures: [{
        connectionId: 'scan-1',
        fromSystemId: JITA,
        signatureId: 'ABC-123',
        wormholeTypeCode: null,
        whClassId: null,
      }],
      connections: [],
      staticsBySystem: new Map(),
      rootSystemId: JITA,
    }));
    const nodes = syncNodes(
      [],
      stateFor([JITA]).systems,
      fallbackLabel,
      NO_DRAG,
      [],
      placed,
    );

    expect(nodes.filter((node) => node.id.startsWith(STATIC_STUB_NODE_ID_PREFIX)))
      .toEqual([]);
    expect(nodes.map((node) => node.id)).toEqual([String(JITA), 'stub:scan-1']);
  });

  it('reserves the inbound hole on a non-root system so four unidentified sigs draw one Unknown', () => {
    const signatures = ['AAA-111', 'BBB-222', 'CCC-333', 'DDD-444'].map(
      (signatureId) => ({
        connectionId: `connection-${signatureId}`,
        fromSystemId: AMARR,
        signatureId,
        wormholeTypeCode: null,
        whClassId: null,
      }),
    );
    const planned = planStubNodes({
      systemIds: [AMARR],
      signatures,
      connections: [],
      staticsBySystem: new Map([[AMARR, SYSTEM_STATICS]]),
      rootSystemId: JITA,
    });
    expect(planned.filter((stub) => 'connectionId' in stub)).toHaveLength(1);
    expect(planned.filter((stub) => 'staticId' in stub)).toHaveLength(2);
  });

  it('copies a stored Leads-to hint onto the scanned stub node', () => {
    const stub = placedStub({
      wormholeTypeCode: 'K162',
      destinationHint: 'unknown',
    });
    const nodes = syncNodes(
      [],
      stateFor([JITA]).systems,
      fallbackLabel,
      NO_DRAG,
      [],
      [stub],
    );
    expect(nodes[1]?.data).toMatchObject({
      name: 'ABC-123',
      whClassId: null,
      destinationHint: 'unknown',
    });
  });
});

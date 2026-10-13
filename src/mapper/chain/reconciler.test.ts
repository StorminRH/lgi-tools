import { describe, expect, it } from 'vitest';
import {
  chainSnapshot,
  positionOfSlot,
  sequentialPositions,
} from './__tests__/chain-snapshot-fixture';
import { type MapChainIntent } from './intents';
import {
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainSnapshot,
  type ChainState,
  type ConnectionRow,
} from './reconciler';

const JITA = 30_000_142;
const AMARR = 30_002_187;
const DODIXIE = 30_002_659;

function link(
  connectionId: string,
  fromSystemId: number,
  toSystemId: number,
): ConnectionRow {
  return { connectionId, fromSystemId, toSystemId };
}

function replay(
  snapshots: readonly ChainSnapshot[],
): { state: ChainState; intents: readonly MapChainIntent[][] } {
  let state = EMPTY_CHAIN_STATE;
  const intents: MapChainIntent[][] = [];
  for (const next of snapshots) {
    const merge = reconcileChain(state, next, sequentialPositions(state, next));
    state = merge.state;
    intents.push([...merge.intents]);
  }
  return { state, intents };
}

function kindsOf(intents: readonly MapChainIntent[]): string[] {
  return intents.map((intent) => intent.kind);
}

describe('map chain reconciler', () => {
  describe('intents', () => {
    it('emits system-appeared carrying the assigned position', () => {
      const { intents } = replay([chainSnapshot([JITA])]);

      expect(intents[0]).toEqual([
        { kind: 'system-appeared', systemId: JITA, position: positionOfSlot(0) },
      ]);
    });

    it('emits connection-appeared carrying both endpoints', () => {
      const { intents } = replay([
        chainSnapshot([JITA, AMARR]),
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
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
      const { intents } = replay([chainSnapshot([JITA, AMARR]), chainSnapshot([JITA])]);

      expect(intents[1]).toEqual([{ kind: 'system-departed', systemId: AMARR }]);
    });

    it('emits connection-departed for a connection a complete snapshot dropped', () => {
      const { intents } = replay([
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        chainSnapshot([JITA, AMARR], []),
      ]);

      expect(intents[1]).toEqual([
        { kind: 'connection-departed', connectionId: 'c1' },
      ]);
    });

    it('suppresses connection intents when a same-merge id-swap shares endpoints', () => {
      const { state, intents } = replay([
        chainSnapshot(
          [JITA, AMARR],
          [link('optimistic:mapConnections:c1', JITA, AMARR)],
        ),
        chainSnapshot([JITA, AMARR], [link('confirmed:c1', JITA, AMARR)]),
      ]);

      expect(intents[1]).toEqual([]);
      expect([...state.connections.keys()]).toEqual(['confirmed:c1']);
      expect(state.connections.get('confirmed:c1')).toEqual(
        link('confirmed:c1', JITA, AMARR),
      );
    });

    it('keeps real same-endpoint replacement intents', () => {
      const { intents } = replay([
        chainSnapshot([JITA, AMARR], [link('persisted:c1', JITA, AMARR)]),
        chainSnapshot([JITA, AMARR], [link('persisted:c2', JITA, AMARR)]),
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
      const active = chainSnapshot(
        [JITA, AMARR],
        [{ ...link('c1', JITA, AMARR), deletedAt: null, purgeAfter: null }],
      );
      const dying = chainSnapshot(
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
        chainSnapshot([JITA, AMARR, DODIXIE], [link('c1', JITA, AMARR)]),
        chainSnapshot(
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
        chainSnapshot([JITA, AMARR, DODIXIE], [link(tempId, JITA, AMARR)]),
        chainSnapshot(
          [JITA, AMARR, DODIXIE],
          [link('c2', JITA, DODIXIE)],
        ),
      ]);

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

    it('emits system-moved when the positions move a placed system', () => {
      const target = { x: 999, y: 42 };
      const { state } = replay([chainSnapshot([JITA])]);
      const snapshot = chainSnapshot([JITA]);
      const second = reconcileChain(
        state,
        snapshot,
        sequentialPositions(state, snapshot, new Map([[JITA, target]])),
      );

      expect(second.intents).toEqual([
        {
          kind: 'system-moved',
          systemId: JITA,
          from: positionOfSlot(0),
          to: target,
        },
      ]);
      expect(second.state.systems.get(JITA)).toEqual({
        systemId: JITA,
        position: target,
      });
    });
  });

  describe('arrivals and departures', () => {
    it('adds exactly one node for an added system row', () => {
      const { state, intents } = replay([chainSnapshot([JITA]), chainSnapshot([JITA, AMARR])]);

      expect(intents[1]).toHaveLength(1);
      expect(state.systems.size).toBe(2);
      expect([...state.systems.keys()]).toEqual([JITA, AMARR]);
    });

    it('adds exactly one edge for an added connection row', () => {
      const { state, intents } = replay([
        chainSnapshot([JITA, AMARR]),
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
      ]);

      expect(intents[1]).toHaveLength(1);
      expect(state.connections.size).toBe(1);
    });

    it('removes the node when a complete snapshot drops it', () => {
      const { state } = replay([chainSnapshot([JITA, AMARR]), chainSnapshot([JITA])]);

      expect([...state.systems.keys()]).toEqual([JITA]);
    });

    it('never infers a departure from an incomplete systems snapshot', () => {
      const { state, intents } = replay([
        chainSnapshot([JITA, AMARR]),
        chainSnapshot([JITA], [], { systems: false }),
      ]);

      expect(intents[1]).toEqual([]);
      expect([...state.systems.keys()]).toEqual([JITA, AMARR]);
    });

    it('never infers a connection departure from an incomplete connections snapshot', () => {
      const { state, intents } = replay([
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        chainSnapshot([JITA, AMARR], [], { connections: false }),
      ]);

      expect(intents[1]).toEqual([]);
      expect(state.connections.size).toBe(1);
    });
  });

  describe('edge visibility', () => {
    it('withholds a connection whose endpoint is absent and emits no intent', () => {
      const { state, intents } = replay([
        chainSnapshot([JITA], [link('c1', JITA, AMARR)]),
      ]);

      expect(state.connections.size).toBe(0);
      expect(kindsOf(intents[0] ?? [])).toEqual(['system-appeared']);
    });

    it('emits connection-appeared only once the missing endpoint arrives', () => {
      const { state, intents } = replay([
        chainSnapshot([JITA], [link('c1', JITA, AMARR)]),
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
      ]);

      expect(kindsOf(intents[1] ?? [])).toEqual([
        'system-appeared',
        'connection-appeared',
      ]);
      expect(state.connections.size).toBe(1);
    });

    it('departs an edge whose endpoint left while the document persists', () => {
      const { state, intents } = replay([
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        chainSnapshot([JITA], [link('c1', JITA, AMARR)]),
      ]);

      expect(kindsOf(intents[1] ?? []).toSorted()).toEqual([
        'connection-departed',
        'system-departed',
      ]);
      expect(state.connections.size).toBe(0);
    });

    it('restores the edge when the endpoint returns', () => {
      const { state, intents } = replay([
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
        chainSnapshot([JITA], [link('c1', JITA, AMARR)]),
        chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
      ]);

      expect(kindsOf(intents[2] ?? [])).toEqual([
        'system-appeared',
        'connection-appeared',
      ]);
      expect(state.connections.size).toBe(1);
    });
  });


  describe('placement', () => {
    it('falls back to the origin when the positions omit a new node', () => {
      const merge = reconcileChain(
        EMPTY_CHAIN_STATE, chainSnapshot([JITA]), new Map(),
      );

      expect(merge.state.systems.get(JITA)?.position).toEqual({ x: 0, y: 0 });
    });

    it('keeps an existing position when the positions omit an existing node', () => {
      const { state } = replay([chainSnapshot([JITA])]);
      const second = reconcileChain(state, chainSnapshot([JITA]), new Map());

      expect(second.state.systems.get(JITA)?.position).toEqual(positionOfSlot(0));
      expect(second.intents).toEqual([]);
    });

    it('frees a departed slot for the next arrival only once the snapshot is complete', () => {
      const complete = replay([
        chainSnapshot([JITA, AMARR]),
        chainSnapshot([JITA]),
        chainSnapshot([JITA, DODIXIE]),
      ]);
      const draining = replay([
        chainSnapshot([JITA, AMARR]),
        chainSnapshot([JITA, DODIXIE], [], { systems: false }),
      ]);

      expect(complete.intents[2]).toEqual([
        { kind: 'system-appeared', systemId: DODIXIE, position: positionOfSlot(1) },
      ]);
      expect([...draining.state.systems.keys()]).toEqual([JITA, AMARR, DODIXIE]);
      expect(draining.intents[1]).toEqual([
        { kind: 'system-appeared', systemId: DODIXIE, position: positionOfSlot(2) },
      ]);
    });
  });
});

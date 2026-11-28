import { expect, test } from 'vitest';
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

test('a chain emits a system and connection appearing, then each departing once a complete snapshot drops it', () => {
  const { intents } = replay([
    chainSnapshot([JITA]),
    chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]),
    chainSnapshot([JITA, AMARR], []),
    chainSnapshot([JITA]),
  ]);

  expect(intents).toEqual([
    [{ kind: 'system-appeared', systemId: JITA, position: positionOfSlot(0) }],
    [
      { kind: 'system-appeared', systemId: AMARR, position: positionOfSlot(1) },
      { kind: 'connection-appeared', connectionId: 'c1', fromSystemId: JITA, toSystemId: AMARR },
    ],
    [{ kind: 'connection-departed', connectionId: 'c1' }],
    [{ kind: 'system-departed', systemId: AMARR }],
  ]);
});

test('suppresses connection intents only for an optimistic id swap that keeps its endpoints', () => {
  const swap = replay([
    chainSnapshot([JITA, AMARR], [link('optimistic:mapConnections:c1', JITA, AMARR)]),
    chainSnapshot([JITA, AMARR], [link('confirmed:c1', JITA, AMARR)]),
  ]);
  expect(swap.intents[1]).toEqual([]);
  expect([...swap.state.connections.keys()]).toEqual(['confirmed:c1']);
  expect(swap.state.connections.get('confirmed:c1')).toEqual(link('confirmed:c1', JITA, AMARR));

  // A persisted line replaced on the same endpoints is a real replacement.
  const replaced = replay([
    chainSnapshot([JITA, AMARR], [link('persisted:c1', JITA, AMARR)]),
    chainSnapshot([JITA, AMARR], [link('persisted:c2', JITA, AMARR)]),
  ]);
  expect(replaced.intents[1]).toEqual([
    { kind: 'connection-departed', connectionId: 'persisted:c1' },
    { kind: 'connection-appeared', connectionId: 'persisted:c2', fromSystemId: JITA, toSystemId: AMARR },
  ]);

  // An optimistic line that departs while another pair appears is not a swap.
  const tempId = 'optimistic:mapConnections:swap-test';
  const moved = replay([
    chainSnapshot([JITA, AMARR, DODIXIE], [link(tempId, JITA, AMARR)]),
    chainSnapshot([JITA, AMARR, DODIXIE], [link('c2', JITA, DODIXIE)]),
  ]);
  expect(moved.intents[1]).toEqual([
    { kind: 'connection-departed', connectionId: tempId },
    { kind: 'connection-appeared', connectionId: 'c2', fromSystemId: JITA, toSystemId: DODIXIE },
  ]);
});

test('updates one connection tombstone stage without birth/death intents', () => {
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

test('positions move a placed system, a node the positions omit keeps its place, and a new one falls back to the origin', () => {
  const target = { x: 999, y: 42 };
  const { state } = replay([chainSnapshot([JITA])]);
  const snapshot = chainSnapshot([JITA]);
  const moved = reconcileChain(
    state,
    snapshot,
    sequentialPositions(state, snapshot, new Map([[JITA, target]])),
  );
  expect(moved.intents).toEqual([
    { kind: 'system-moved', systemId: JITA, from: positionOfSlot(0), to: target },
  ]);
  expect(moved.state.systems.get(JITA)).toEqual({ systemId: JITA, position: target });

  const kept = reconcileChain(state, chainSnapshot([JITA]), new Map());
  expect(kept.state.systems.get(JITA)?.position).toEqual(positionOfSlot(0));
  expect(kept.intents).toEqual([]);

  const fresh = reconcileChain(EMPTY_CHAIN_STATE, chainSnapshot([JITA]), new Map());
  expect(fresh.state.systems.get(JITA)?.position).toEqual({ x: 0, y: 0 });
});

test('withholds an edge until both endpoints are present, departs it when one leaves, and restores it on return', () => {
  const withheld = chainSnapshot([JITA], [link('c1', JITA, AMARR)]);
  const joined = chainSnapshot([JITA, AMARR], [link('c1', JITA, AMARR)]);
  const { state, intents } = replay([withheld, joined, withheld, joined]);

  expect(replay([withheld]).state.connections.size).toBe(0);
  expect(replay([withheld, joined, withheld]).state.connections.size).toBe(0);

  expect(kindsOf(intents[0] ?? [])).toEqual(['system-appeared']);
  expect(kindsOf(intents[1] ?? [])).toEqual([
    'system-appeared',
    'connection-appeared',
  ]);
  expect(kindsOf(intents[2] ?? []).toSorted()).toEqual([
    'connection-departed',
    'system-departed',
  ]);
  expect(kindsOf(intents[3] ?? [])).toEqual([
    'system-appeared',
    'connection-appeared',
  ]);
  expect(state.connections.size).toBe(1);
});

test('frees a departed slot for the next arrival only once the snapshot is complete', () => {
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

import { expect, test } from 'vitest';
import type { ChainPosition, MapChainIntent } from '../chain/intents';
import { chainSnapshot } from '../chain/__tests__/chain-snapshot-fixture';
import {
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainMerge,
  type ChainSnapshot,
  type ChainState,
} from '../chain/reconciler';
import { layoutFacts } from './__tests__/layout-facts-fixture';
import { compassKernel } from './compass';
import { DEFAULT_LAYOUT_CONFIG } from './layout-contract';

const A = 31_000_001;
const B = 31_000_002;
const C = 31_000_003;
const D = 31_000_004;

function mergeUnplaced(previous: ChainState, snapshot: ChainSnapshot): ChainMerge {
  return reconcileChain(previous, snapshot, new Map());
}

function systemOrder(merge: ChainMerge): number[] {
  return [...merge.state.systems.keys()];
}

function appearedOrder(intents: readonly MapChainIntent[]): number[] {
  return intents.flatMap((intent) =>
    intent.kind === 'system-appeared' ? [intent.systemId] : [],
  );
}

function connectionOrder(merge: ChainMerge): (readonly [number, number])[] {
  return [...merge.state.connections.values()].map(
    (connection) => [connection.fromSystemId, connection.toSystemId] as const,
  );
}

test('holds an initial complete snapshot in creation order', () => {
  const merge = mergeUnplaced(EMPTY_CHAIN_STATE, chainSnapshot([C, A, B]));
  expect(systemOrder(merge)).toEqual([C, A, B]);
  expect(appearedOrder(merge.intents)).toEqual([C, A, B]);
});

test('keeps retained order and appends arrivals while pages drain', () => {
  const first = mergeUnplaced(
    EMPTY_CHAIN_STATE,
    chainSnapshot([A, B], [], { systems: false }),
  );
  const second = mergeUnplaced(first.state, chainSnapshot([A, B, C, D]));
  expect(systemOrder(first)).toEqual([A, B]);
  expect(systemOrder(second)).toEqual([A, B, C, D]);
  expect(appearedOrder(second.intents)).toEqual([C, D]);
});

test('preserves survivor order across a departure and appends a re-arrival at the end', () => {
  const first = mergeUnplaced(EMPTY_CHAIN_STATE, chainSnapshot([A, B, C]));
  const departed = mergeUnplaced(first.state, chainSnapshot([A, C]));
  expect(systemOrder(departed)).toEqual([A, C]);
  const returned = mergeUnplaced(departed.state, chainSnapshot([A, C, B]));
  expect(systemOrder(returned)).toEqual([A, C, B]);
  expect(appearedOrder(returned.intents)).toEqual([B]);
});

test('holds visible connections retained-then-snapshot while draining, snapshot-order once complete', () => {
  const first = mergeUnplaced(
    EMPTY_CHAIN_STATE,
    chainSnapshot(
      [A, B, C],
      [
        { connectionId: 'e1', fromSystemId: A, toSystemId: B },
        { connectionId: 'e2', fromSystemId: B, toSystemId: C },
      ],
    ),
  );
  const second = mergeUnplaced(
    first.state,
    chainSnapshot(
      [A, B, C],
      [
        { connectionId: 'e1', fromSystemId: A, toSystemId: B },
        { connectionId: 'e3', fromSystemId: A, toSystemId: C },
      ],
      { connections: false },
    ),
  );
  const third = mergeUnplaced(
    second.state,
    chainSnapshot(
      [A, B, C],
      [
        { connectionId: 'e1', fromSystemId: A, toSystemId: B },
        { connectionId: 'e2', fromSystemId: B, toSystemId: C },
        { connectionId: 'e3', fromSystemId: A, toSystemId: C },
      ],
    ),
  );
  expect(connectionOrder(first)).toEqual([[A, B], [B, C]]);
  expect(connectionOrder(second)).toEqual([[A, B], [B, C], [A, C]]);
  expect(connectionOrder(third)).toEqual([[A, B], [B, C], [A, C]]);
});

test('holds every departure back while the systems collection is still draining', () => {
  const first = mergeUnplaced(EMPTY_CHAIN_STATE, chainSnapshot([A, B, C]));
  const second = mergeUnplaced(
    first.state,
    chainSnapshot([C], [], { systems: false }),
  );
  expect(systemOrder(second)).toEqual([A, B, C]);
  expect(second.intents).toEqual([]);
});

function at(positions: ReadonlyMap<number, ChainPosition>, systemId: number): ChainPosition {
  const position = positions.get(systemId);
  if (position === undefined) throw new Error(`kernel omitted system ${systemId}`);
  return position;
}

const PROPORTIONAL = {
  ...DEFAULT_LAYOUT_CONFIG,
  wedgePolicy: 'proportional' as const,
  siblingSpread: 3,
};

test('emits exact system-appeared intents at kernel positions on first appearance', async () => {
  const positions = await compassKernel(layoutFacts([A, B], [[A, B]]));
  const merge = reconcileChain(
    EMPTY_CHAIN_STATE,
    chainSnapshot([A, B], [{ connectionId: 'e1', fromSystemId: A, toSystemId: B }]),
    positions,
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
  expect(merge.state.systems.get(B)?.position).toEqual(at(positions, B));
});

test('emits exact system-moved intents when a new kernel result repositions a node', async () => {
  const before = await compassKernel(layoutFacts([A, B, C], [[A, B], [B, C]]), PROPORTIONAL);
  const after = await compassKernel(
    layoutFacts([A, B, C, D], [[A, B], [B, C], [B, D]]),
    PROPORTIONAL,
  );
  expect(at(after, C)).not.toEqual(at(before, C));

  const first = reconcileChain(
    EMPTY_CHAIN_STATE,
    chainSnapshot([A, B, C]),
    before,
  );
  const merge = reconcileChain(
    first.state,
    chainSnapshot([A, B, C, D]),
    after,
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

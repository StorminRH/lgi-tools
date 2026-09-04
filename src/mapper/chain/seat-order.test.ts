import { describe, expect, it } from 'vitest';
import { compassKernel } from '../layout/compass';
import { deriveChainTree } from '../layout/facts';
import { DEFAULT_LAYOUT_CONFIG } from '../layout/layout-contract';
import { movedSystems } from '../layout/proof-kit';
import {
  assignerFromPositions,
} from './placement';
import {
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainSnapshot,
} from './reconciler';
import {
  seatOrderedLayout,
  type SeatOrderedConnection,
  type SeatOrderedHolder,
  type SeatOrderedInput,
  type SeatOrderedStub,
} from './stub-layout';

const P = 31_000_001;
const DEST = 31_000_002;
const SIBLING = 31_000_003;
const THIRD = 31_000_004;

function resolved(
  partial: Pick<SeatOrderedConnection, '_id'> & Partial<SeatOrderedConnection>,
): SeatOrderedConnection {
  return {
    fromSystemId: P,
    toSystemId: DEST,
    _creationTime: 1,
    ...partial,
  };
}

function stub(
  partial: Pick<SeatOrderedStub, 'connectionId' | 'layoutSystemId'> & Partial<SeatOrderedStub>,
): SeatOrderedStub {
  return {
    fromSystemId: P,
    _creationTime: 1,
    ...partial,
  };
}

function holder(
  partial: Pick<SeatOrderedHolder, 'connectionId'> & Partial<SeatOrderedHolder>,
): SeatOrderedHolder {
  return {
    fromSystemId: P,
    _creationTime: 1,
    ...partial,
  };
}

function input(partial: Partial<SeatOrderedInput>): SeatOrderedInput {
  return {
    systems: [{ systemId: P }],
    connections: [],
    stubRows: [],
    slotHolders: [],
    ...partial,
  };
}

function factsOf(factsInput: SeatOrderedInput) {
  return seatOrderedLayout(factsInput).facts;
}

async function layoutPositions(factsInput: SeatOrderedInput) {
  const ordered = seatOrderedLayout(factsInput);
  const positions = await compassKernel(ordered.facts, DEFAULT_LAYOUT_CONFIG);
  return { ordered, positions };
}

function childId(
  layout: ReturnType<typeof seatOrderedLayout>,
  key: string,
): number {
  const id = layout.childIdBySeatKey.get(key);
  if (id === undefined) throw new Error(`missing seat ${key}`);
  return id;
}

function snapshotOf(factsInput: SeatOrderedInput): ChainSnapshot {
  return {
    systems: {
      rows: factsInput.systems.map((row) => ({ systemId: row.systemId })),
      complete: true,
    },
    connections: {
      rows: factsInput.connections.flatMap((row) => {
        if (row.toSystemId === null) return [];
        return [{
          connectionId: row._id,
          fromSystemId: row.fromSystemId,
          toSystemId: row.toSystemId,
        }];
      }),
      complete: true,
    },
  };
}

describe('seat-ordered children', () => {
  it('paste appends a second sig and moves nothing already drawn', async () => {
    const first = stub({ connectionId: 'sig-1', layoutSystemId: -1, _creationTime: 10 });
    const beforeInput = input({ stubRows: [first] });
    const afterInput = input({
      stubRows: [
        first,
        stub({ connectionId: 'sig-2', layoutSystemId: -2, _creationTime: 20 }),
      ],
    });
    const before = await compassKernel(factsOf(beforeInput), DEFAULT_LAYOUT_CONFIG);
    const after = await compassKernel(factsOf(afterInput), DEFAULT_LAYOUT_CONFIG);
    expect(movedSystems(before, after)).toEqual([]);
    expect(after.get(-1)).toEqual(before.get(-1));
  });

  it('identify keeps coordinates of the same row', async () => {
    const scanned = stub({
      connectionId: 'sig-1',
      layoutSystemId: -1,
      _creationTime: 10,
    });
    const identified = stub({
      connectionId: 'sig-1',
      layoutSystemId: -1,
      _creationTime: 10,
      seatOrderAt: 10,
    });
    const before = await layoutPositions(input({ stubRows: [scanned] }));
    const after = await layoutPositions(input({ stubRows: [identified] }));
    expect(after.positions.get(-1)).toEqual(before.positions.get(-1));
  });

  it('resolve keeps coordinates and adds no child slot', async () => {
    const beforeInput = input({
      stubRows: [stub({ connectionId: 'c1', layoutSystemId: -1, _creationTime: 10 })],
    });
    const afterInput = input({
      systems: [{ systemId: P }, { systemId: DEST }],
      connections: [resolved({ _id: 'c1', _creationTime: 10 })],
    });
    const before = await layoutPositions(beforeInput);
    const after = await layoutPositions(afterInput);
    expect(after.positions.get(DEST)).toEqual(before.positions.get(-1));
    expect(deriveChainTree(before.ordered.facts).childrenInOrder.get(P)).toHaveLength(1);
    expect(deriveChainTree(after.ordered.facts).childrenInOrder.get(P)).toHaveLength(1);
  });

  it('jump merge carries seatOrderAt and keeps the stub coordinates', async () => {
    const beforeInput = input({
      stubRows: [stub({ connectionId: 'sig-1', layoutSystemId: -1, _creationTime: 10 })],
    });
    const afterInput = input({
      systems: [{ systemId: P }, { systemId: DEST }],
      connections: [resolved({
        _id: 'jump-1',
        _creationTime: 40,
        seatOrderAt: 10,
      })],
    });
    const before = await layoutPositions(beforeInput);
    const after = await layoutPositions(afterInput);
    expect(after.positions.get(DEST)).toEqual(before.positions.get(-1));
  });

  it('delete leaves a gap and moves nothing already drawn', async () => {
    const first = stub({ connectionId: 'sig-1', layoutSystemId: -1, _creationTime: 10 });
    const second = stub({ connectionId: 'sig-2', layoutSystemId: -2, _creationTime: 20 });
    const third = stub({ connectionId: 'sig-3', layoutSystemId: -3, _creationTime: 30 });
    const before = await layoutPositions(input({
      stubRows: [first, second, third],
    }));
    const after = await layoutPositions(input({
      stubRows: [
        stub({ connectionId: 'sig-2', layoutSystemId: -1, _creationTime: 20 }),
        stub({ connectionId: 'sig-3', layoutSystemId: -2, _creationTime: 30 }),
      ],
      slotHolders: [holder({ connectionId: 'sig-1', _creationTime: 10 })],
    }));
    expect(after.positions.get(childId(after.ordered, 'sig-2'))).toEqual(
      before.positions.get(childId(before.ordered, 'sig-2')),
    );
    expect(after.positions.get(childId(after.ordered, 'sig-3'))).toEqual(
      before.positions.get(childId(before.ordered, 'sig-3')),
    );
    expect(after.ordered.facts.connections).toHaveLength(3);
    expect(placedAt(after.ordered, after.positions, 'sig-1')).toEqual(
      before.positions.get(childId(before.ordered, 'sig-1')),
    );
  });

  it('static claim puts the sig where the ghost was', async () => {
    const ghost = stub({
      connectionId: 'ph-C247',
      layoutSystemId: -1,
      _creationTime: 5,
      staticCode: 'C247',
    });
    const extra = stub({ connectionId: 'sig-2', layoutSystemId: -2, _creationTime: 20 });
    const claimed = stub({
      connectionId: 'ph-C247',
      layoutSystemId: -1,
      _creationTime: 5,
      staticCode: 'C247',
    });
    const before = await layoutPositions(input({ stubRows: [ghost, extra] }));
    const after = await layoutPositions(input({ stubRows: [claimed, extra] }));
    expect(after.positions.get(childId(after.ordered, 'static:31000001:C247'))).toEqual(
      before.positions.get(childId(before.ordered, 'static:31000001:C247')),
    );
    expect(after.positions.get(childId(after.ordered, 'sig-2'))).toEqual(
      before.positions.get(childId(before.ordered, 'sig-2')),
    );
  });

  it('respawn shares the tombstone slot', async () => {
    const dead = holder({
      connectionId: 'claimed-C247',
      _creationTime: 5,
      seatOrderAt: 5,
      staticCode: 'C247',
    });
    const respawn = stub({
      connectionId: 'respawn-C247',
      layoutSystemId: -1,
      _creationTime: 80,
      seatOrderAt: 5,
      staticCode: 'C247',
    });
    const extra = stub({ connectionId: 'sig-2', layoutSystemId: -2, _creationTime: 20 });
    const before = await layoutPositions(input({
      stubRows: [
        stub({
          connectionId: 'claimed-C247',
          layoutSystemId: -1,
          _creationTime: 5,
          seatOrderAt: 5,
          staticCode: 'C247',
        }),
        extra,
      ],
    }));
    const after = await layoutPositions(input({
      stubRows: [respawn, extra],
      slotHolders: [dead],
    }));
    expect(after.ordered.facts.connections).toHaveLength(2);
    expect(after.positions.get(childId(after.ordered, 'static:31000001:C247'))).toEqual(
      before.positions.get(childId(before.ordered, 'static:31000001:C247')),
    );
    expect(after.positions.get(childId(after.ordered, 'sig-2'))).toEqual(
      before.positions.get(childId(before.ordered, 'sig-2')),
    );
  });

  it('restore with claimed respawn draws both live rows in one slot', async () => {
    const restored = stub({
      connectionId: 'restored-C247',
      layoutSystemId: -1,
      _creationTime: 5,
      seatOrderAt: 5,
      staticCode: 'C247',
    });
    const claimedRespawn = stub({
      connectionId: 'respawn-C247',
      layoutSystemId: -2,
      _creationTime: 80,
      seatOrderAt: 5,
      staticCode: 'C247',
    });
    const extra = stub({ connectionId: 'sig-2', layoutSystemId: -3, _creationTime: 20 });
    const before = await layoutPositions(input({ stubRows: [restored, extra] }));
    const after = await layoutPositions(input({
      stubRows: [restored, claimedRespawn, extra],
    }));
    expect(after.ordered.facts.connections).toHaveLength(2);
    expect(after.positions.get(childId(after.ordered, 'static:31000001:C247'))).toEqual(
      before.positions.get(childId(before.ordered, 'static:31000001:C247')),
    );
    expect(after.positions.get(childId(after.ordered, 'sig-2'))).toEqual(
      before.positions.get(childId(before.ordered, 'sig-2')),
    );
  });

  it('late joiner matches the step-by-step picture', async () => {
    const ghost = stub({
      connectionId: 'ph-C247',
      layoutSystemId: -1,
      _creationTime: 5,
      staticCode: 'C247',
    });
    const pasted = stub({ connectionId: 'sig-2', layoutSystemId: -2, _creationTime: 20 });
    const claimed = stub({
      connectionId: 'ph-C247',
      layoutSystemId: -1,
      _creationTime: 5,
      staticCode: 'C247',
    });
    const resolvedClaim = input({
      systems: [{ systemId: P }, { systemId: DEST }],
      connections: [resolved({
        _id: 'ph-C247',
        _creationTime: 5,
        seatOrderAt: 5,
        staticCode: 'C247',
      })],
      stubRows: [pasted],
    });
    const afterPaste = input({ stubRows: [ghost, pasted] });
    const afterClaim = input({ stubRows: [claimed, pasted] });
    const stepPaste = await compassKernel(factsOf(afterPaste), DEFAULT_LAYOUT_CONFIG);
    const stepClaim = await compassKernel(factsOf(afterClaim), DEFAULT_LAYOUT_CONFIG);
    const stepResolve = await compassKernel(factsOf(resolvedClaim), DEFAULT_LAYOUT_CONFIG);
    const late = await compassKernel(factsOf(resolvedClaim), DEFAULT_LAYOUT_CONFIG);
    expect(movedSystems(stepPaste, stepClaim)).toEqual([]);
    expect(stepResolve.get(DEST)).toEqual(stepClaim.get(-1));
    expect(movedSystems(late, stepResolve)).toEqual([]);
  });

  it('purge closes the gap and the reconciler emits system-moved', async () => {
    const held = input({
      systems: [{ systemId: P }, { systemId: SIBLING }, { systemId: THIRD }],
      connections: [
        resolved({ _id: 'b', toSystemId: SIBLING, _creationTime: 20 }),
        resolved({ _id: 'c', toSystemId: THIRD, _creationTime: 30 }),
      ],
      slotHolders: [holder({ connectionId: 'sig-1', _creationTime: 10 })],
    });
    const purged = input({
      systems: [{ systemId: P }, { systemId: SIBLING }, { systemId: THIRD }],
      connections: [
        resolved({ _id: 'b', toSystemId: SIBLING, _creationTime: 20 }),
        resolved({ _id: 'c', toSystemId: THIRD, _creationTime: 30 }),
      ],
    });
    const before = await compassKernel(factsOf(held), DEFAULT_LAYOUT_CONFIG);
    const after = await compassKernel(factsOf(purged), DEFAULT_LAYOUT_CONFIG);
    expect(after.get(P)).toEqual(before.get(P));
    expect(movedSystems(before, after).filter((systemId) => systemId > 0)).toEqual([
      SIBLING,
      THIRD,
    ]);
    const first = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshotOf(held),
      assignerFromPositions(before),
    );
    const second = reconcileChain(
      first.state,
      snapshotOf(purged),
      assignerFromPositions(after),
    );
    expect(
      second.intents
        .filter((intent) => intent.kind === 'system-moved')
        .map((intent) => intent.systemId),
    ).toEqual([SIBLING, THIRD]);
  });

  it('leaves a resolved edge dangling when its destination is not in the snapshot', () => {
    const facts = factsOf(input({
      systems: [{ systemId: P }],
      connections: [resolved({ _id: 'c1', toSystemId: DEST, _creationTime: 10 })],
    }));
    expect(facts.systems).toEqual([{ systemId: P }]);
    expect(facts.connections).toEqual([
      { fromSystemId: P, toSystemId: DEST },
    ]);
  });

  it('is deterministic for identical seat-ordered facts', async () => {
    const facts = factsOf(input({
      systems: [{ systemId: P }, { systemId: DEST }],
      connections: [resolved({ _id: 'c1', _creationTime: 40, seatOrderAt: 10 })],
      stubRows: [stub({ connectionId: 'sig-2', layoutSystemId: -1, _creationTime: 20 })],
      slotHolders: [holder({ connectionId: 'sig-1', _creationTime: 5 })],
    }));
    const first = await compassKernel(facts, DEFAULT_LAYOUT_CONFIG);
    const second = await compassKernel(facts, DEFAULT_LAYOUT_CONFIG);
    expect([...second.entries()]).toEqual([...first.entries()]);
  });
});

function placedAt(
  layout: ReturnType<typeof seatOrderedLayout>,
  positions: ReadonlyMap<number, { readonly x: number; readonly y: number }>,
  key: string,
) {
  return positions.get(childId(layout, key));
}

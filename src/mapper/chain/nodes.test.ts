import { describe, expect, it } from 'vitest';
import type { ChainNode } from '../canvas/SystemNode';
import type { SystemLabel } from './labels';
import { buildEdges, syncNodes } from './nodes';
import {
  applyUserPlacement,
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainSnapshot,
  type ChainState,
} from './reconciler';
import { gridAssigner, positionOfSlot } from './placement';

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
  return reconcileChain(EMPTY_CHAIN_STATE, snapshot(systemIds), NO_DRAG, gridAssigner)
    .state;
}

describe('canvas node projection', () => {
  it('projects one node per reconciled system with its label', () => {
    const nodes = syncNodes([], stateFor([JITA, AMARR]).systems, namedLabel, NO_DRAG);

    expect(nodes).toEqual([
      {
        id: String(JITA),
        type: 'chainSystem',
        position: positionOfSlot(0),
        data: { name: 'Jita', className: null },
      },
      {
        id: String(AMARR),
        type: 'chainSystem',
        position: positionOfSlot(1),
        data: { name: 'J123456', className: 'C5' },
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

    expect(before[0]?.data).toEqual({ name: String(JITA), className: null });
    expect(after[0]?.data).toEqual({ name: 'Jita', className: null });
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
      gridAssigner,
    ).state;

    expect(buildEdges(state.connections)).toEqual([
      { id: 'c1', source: String(JITA), target: String(AMARR) },
    ]);
  });

  it('projects nothing for a withheld connection', () => {
    const state = reconcileChain(
      EMPTY_CHAIN_STATE,
      snapshot([JITA], [
        { connectionId: 'c1', fromSystemId: JITA, toSystemId: AMARR },
      ]),
      NO_DRAG,
      gridAssigner,
    ).state;

    expect(buildEdges(state.connections)).toEqual([]);
  });
});

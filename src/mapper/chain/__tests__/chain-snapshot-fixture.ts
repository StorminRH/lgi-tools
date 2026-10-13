import type { ChainPosition } from '../intents';
import type { ChainSnapshot, ChainState, ConnectionRow } from '../reconciler';

const SLOT_COLUMNS = 6;
const SLOT_WIDTH = 220;
const SLOT_HEIGHT = 160;

export function chainSnapshot(
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

export function positionOfSlot(slot: number): ChainPosition {
  return {
    x: (slot % SLOT_COLUMNS) * SLOT_WIDTH,
    y: Math.floor(slot / SLOT_COLUMNS) * SLOT_HEIGHT,
  };
}

function slotOfPosition(position: ChainPosition): number | null {
  const column = position.x / SLOT_WIDTH;
  const row = position.y / SLOT_HEIGHT;
  const onGrid =
    Number.isInteger(column) &&
    Number.isInteger(row) &&
    column >= 0 &&
    column < SLOT_COLUMNS &&
    row >= 0;
  return onGrid ? row * SLOT_COLUMNS + column : null;
}

/**
 * Grid positions for a merge of `snapshot` into `previous`. Retained systems
 * keep their positions and hold their slots: every previous system the
 * snapshot still lists, or all of them while the systems collection is
 * incomplete (the reconciler's present-systems rule). Each arrival, in
 * snapshot row order, takes the next free slot. `overrides` replaces entries
 * last, so a test can propose a move.
 */
export function sequentialPositions(
  previous: ChainState,
  snapshot: ChainSnapshot,
  overrides: ReadonlyMap<number, ChainPosition> = new Map(),
): Map<number, ChainPosition> {
  const incoming = new Set(snapshot.systems.rows.map((row) => row.systemId));
  const positions = new Map<number, ChainPosition>();
  const occupied = new Set<number>();
  for (const placed of previous.systems.values()) {
    if (!incoming.has(placed.systemId) && snapshot.systems.complete) continue;
    positions.set(placed.systemId, placed.position);
    const slot = slotOfPosition(placed.position);
    if (slot !== null) occupied.add(slot);
  }
  const retained = new Set(positions.keys());
  let nextSlot = 0;
  for (const { systemId } of snapshot.systems.rows) {
    if (retained.has(systemId)) continue;
    while (occupied.has(nextSlot)) nextSlot += 1;
    occupied.add(nextSlot);
    positions.set(systemId, positionOfSlot(nextSlot));
  }
  for (const [systemId, position] of overrides) positions.set(systemId, position);
  return positions;
}

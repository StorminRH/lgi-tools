import type { ChainPosition } from '../intents';
import type { PlacementAssigner } from '../placement';
import type { ChainSnapshot, ConnectionRow } from '../reconciler';

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
 * Keeps every placed system where it is and puts each unplaced one in the
 * next grid slot that no placed system already holds.
 */
export const sequentialTestAssigner: PlacementAssigner = ({ systems }) => {
  const proposals = new Map<number, ChainPosition>();
  const occupied = new Set<number>();
  for (const candidate of systems) {
    const slot = candidate.position === null ? null : slotOfPosition(candidate.position);
    if (slot !== null) occupied.add(slot);
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

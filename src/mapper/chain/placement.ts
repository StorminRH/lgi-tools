// Provisional node placement, behind the one-function seam sub-version 4.0.3.1 replaces.
//
// CONTRACT (session 4.0.2.3.1, decision PD-3): placement here is deliberately NOT a layout
// algorithm. It parks arrivals on a deterministic grid so the live read path can be observed, and
// nothing more — the deterministic layout engine is owned and gated by 4.0.3.1 (contract OOS-1).
//
// The seam is what matters. 4.0.3.1 replaces `gridAssigner` with a real engine behind the same
// `PlacementAssigner` type; the reconciler and the intent contract do not change. That is why the
// assigner receives the connections too (this grid ignores them, a layout engine needs them) and why
// it is consulted on every merge for every unprotected node rather than only at first appearance —
// a first-appearance-only call site would make the repositioning path unreachable and force 4.0.3.1
// to rework the reconciler.
import type { ChainPosition } from './intents';

/** Columns before the row-major sequence wraps. */
export const GRID_COLUMNS = 6;

/** Horizontal spacing between adjacent grid cells, in canvas units. */
export const GRID_SPACING_X = 220;

/** Vertical spacing between adjacent grid rows, in canvas units. */
export const GRID_SPACING_Y = 160;

/** One system offered to the assigner for placement. */
export interface PlacementCandidate {
  readonly systemId: number;
  /** The node's current position, or `null` on first appearance. */
  readonly position: ChainPosition | null;
  /**
   * True when the user owns this position, so no assigner may propose a change.
   *
   * The reconciler enforces this regardless of what an assigner returns (contract HC-1); it is
   * surfaced here so a layout engine can lay out around a pinned node instead of fighting it.
   */
  readonly locked: boolean;
}

/** One connection offered to the assigner. Unused by the grid; the layout engine needs the graph. */
export interface PlacementEdge {
  readonly fromSystemId: number;
  readonly toSystemId: number;
}

/** Everything an assigner may consider when proposing positions. */
export interface PlacementInput {
  readonly systems: readonly PlacementCandidate[];
  readonly connections: readonly PlacementEdge[];
}

/**
 * Proposes a position for every candidate it wishes to place.
 *
 * An omitted system keeps its current position. A returned position that differs from an existing
 * unprotected node's current one is a reposition, which the reconciler emits as `system-moved`.
 */
export type PlacementAssigner = (input: PlacementInput) => ReadonlyMap<number, ChainPosition>;

/** The canvas position of one row-major grid slot. */
export function positionOfSlot(slot: number): ChainPosition {
  return {
    x: (slot % GRID_COLUMNS) * GRID_SPACING_X,
    y: Math.floor(slot / GRID_COLUMNS) * GRID_SPACING_Y,
  };
}

/**
 * The grid slot a position occupies, or `null` when it sits off-grid.
 *
 * A user-dragged node lands anywhere, so it reserves no cell — provisional placement may collide
 * with it, which OOS-1 explicitly permits.
 */
function slotOfPosition(position: ChainPosition): number | null {
  const column = position.x / GRID_SPACING_X;
  const row = position.y / GRID_SPACING_Y;
  if (!Number.isInteger(column) || !Number.isInteger(row)) return null;
  if (column < 0 || column >= GRID_COLUMNS || row < 0) return null;
  return row * GRID_COLUMNS + column;
}

/**
 * Parks each first appearance in the next free row-major cell and leaves every already-placed node
 * exactly where it is.
 *
 * Deterministic by construction: the free cell is the lowest index not already occupied, and
 * candidates are consumed in the order given, so two identical arrival orders place identically.
 * Because an already-placed node is always proposed its current position, this assigner never
 * produces a `system-moved` in production — the emission path exists for 4.0.3.1.
 */
export const gridAssigner: PlacementAssigner = ({ systems }) => {
  const proposals = new Map<number, ChainPosition>();
  const occupied = new Set<number>();

  for (const candidate of systems) {
    if (candidate.position === null) continue;
    const slot = slotOfPosition(candidate.position);
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

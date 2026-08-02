// Node placement behind the one-function seam the reconciler consults every merge.
//
// CONTRACT (session 4.0.3.1.2): the only position-computing path is the layout
// kernel behind `layout-contract.ts`. This module adapts one kernel result to
// the frozen `PlacementAssigner` seam — it never computes geometry of its own.
// The provisional grid assigner is gone.
import type { ChainPosition } from './intents';

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

/** One connection offered to the assigner. The layout engine needs the graph. */
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

/**
 * Adapts one kernel result to the assigner seam; omitted ids keep their current position.
 *
 * The returned assigner ignores its input's candidates for geometry — the kernel already
 * considered the graph — and proposes exactly the supplied positions. Locked/user-owned
 * protection remains the reconciler's job.
 */
export function assignerFromPositions(
  positions: ReadonlyMap<number, ChainPosition>,
): PlacementAssigner {
  return () => positions;
}

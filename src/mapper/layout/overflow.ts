// Overflow-sector parking for systems with no path to the root yet.
//
// Kept beside the engine rather than inside it so orphan behavior is a kernel property, not an
// engine detail: wherever the tree's geometry comes from, a system whose connection has not
// drained yet parks in the same deterministic spot, and when its edge arrives it relocates into
// its wedge as an ordinary spawn move (plan "Edge and failure behavior").
//
// STATED EXCEPTION to the fixed-slot "adds move nothing" posture (operator-accepted 2026-08-01):
// the parking cluster itself may shift — remaining orphans close ranks when an earlier orphan
// attaches (slots key to the compacted orphan list), and the whole cluster steps outward when
// tree growth crosses the four-ring base quantum. Parked orphans are transient by design; the
// attached tree never moves for either reason.
import type { ChainPosition } from '../chain/intents';
import { headingVector } from './geometry';
import { SEPARATION_MARGIN, type LayoutConfig } from './layout-contract';
import { distance } from './trig';

/** Orphans per overflow row before the cluster wraps one ring outward. */
const ORPHANS_PER_ROW = 6;

/**
 * How far out the overflow cluster starts: the tree's maximum radial extent plus one ring, rounded
 * up to a four-ring boundary. The quantization keeps the cluster still through most tree growth —
 * it only steps outward when the tree crosses a boundary — and rounding up guarantees every orphan
 * sits at least one full ring beyond every placed node, which makes cluster-versus-tree separation
 * a geometric certainty rather than a measured hope.
 */
function overflowBaseRadius(
  positions: ReadonlyMap<number, ChainPosition>,
  config: LayoutConfig,
): number {
  let maxRadius = 0;
  const origin = { x: 0, y: 0 };
  for (const position of positions.values()) {
    maxRadius = Math.max(maxRadius, distance(origin, position));
  }
  const quantum = 4 * config.ringSpacing;
  return Math.ceil((maxRadius + config.ringSpacing) / quantum) * quantum;
}

/**
 * Parks each orphan in the overflow sector, mutating `positions` in place (the map under
 * construction inside an engine, never a caller's map).
 *
 * The sector heading is the last entry of `directionSequence` — the compass direction root
 * subtrees claim last, so a growing chain collides with the overflow cluster as late as possible.
 * Orphans fill rows of `ORPHANS_PER_ROW` across the heading, in creation order, spaced with the
 * same structural margin the rings use (never exactly at the gate boundary, where float dust
 * would fail it), wrapping one ring outward per row.
 */
export function parkOrphans(
  positions: Map<number, ChainPosition>,
  orphans: readonly number[],
  config: LayoutConfig,
): void {
  if (orphans.length === 0) return;

  const heading = config.directionSequence[config.directionSequence.length - 1] ?? 0;
  const along = headingVector(heading);
  const acrossX = -along.y;
  const acrossY = along.x;

  const baseRadius = overflowBaseRadius(positions, config);
  const columnSpacing = config.minSeparation * SEPARATION_MARGIN;

  for (const [index, systemId] of orphans.entries()) {
    const row = Math.floor(index / ORPHANS_PER_ROW);
    const column = (index % ORPHANS_PER_ROW) - (ORPHANS_PER_ROW - 1) / 2;
    const distance = baseRadius + row * config.ringSpacing;
    const across = column * columnSpacing;
    positions.set(systemId, {
      x: along.x * distance + acrossX * across,
      y: along.y * distance + acrossY * across,
    });
  }
}

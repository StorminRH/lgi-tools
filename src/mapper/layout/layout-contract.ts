// The deterministic layout seam — the only vocabulary 4.0.3.1.2's worker and dials may consume.
//
// CONTRACT (session 4.0.3.1.1, decision PD-1): the kernel is a pure function of synchronized facts
// plus a code-constant config. The kernel behind this seam is the only position-computing
// authority in the mapper's layout story, and the input type structurally excludes everything
// contract HC-2 forbids: no current positions, no lock state, no caller state, no clock, no
// randomness. Purity by type beats purity by discipline — an engine literally cannot read what it
// must not see.
//
// The kernel is async because its production home is 4.0.3.1.2's worker boundary — a worker call
// is a promise however the geometry inside is computed; the compass engine's core stays a
// synchronous pure function wrapped at the seam.
import type { ChainPosition } from '../chain/intents';

/** One undirected edge in the layout vocabulary, in the orientation the facts delivered it. */
export interface LayoutEdge {
  readonly fromSystemId: number;
  readonly toSystemId: number;
}

/**
 * The synchronized graph facts — the only inputs that may influence shared layout (contract HC-2).
 *
 * Array order is synchronized creation order; array position IS the order, so no timestamps or
 * sequence numbers travel here. A root override must itself be synchronized state: when the set-root
 * affordance ships it becomes a synchronized map property, never local state.
 */
export interface LayoutFacts {
  readonly systems: readonly { readonly systemId: number }[];
  readonly connections: readonly LayoutEdge[];
  /** Optional synchronized root override; ignored when it names no present system. */
  readonly rootSystemId?: number;
}

/**
 * How siblings divide their parent's wedge.
 *
 * - `fixed-slot`: each child occupies a slot determined only by its creation index, so adding a
 *   sibling moves nothing that already exists.
 * - `proportional`: siblings re-spread evenly across the wedge, so a sector fill moves exactly the
 *   affected sibling group (and the subtrees riding on those siblings).
 */
export type WedgePolicy = 'fixed-slot' | 'proportional';

/**
 * The structural margin applied over `minSeparation` wherever spacing is derived from it (ring
 * bucket arcs, overflow-cluster spacing), so the no-overlap gate is cleared with room to spare
 * rather than met exactly on a float boundary.
 */
export const SEPARATION_MARGIN = 1.05;

/**
 * The kernel's tuning knobs. Every knob is a code constant identical on every client this session —
 * 4.0.3.1.2 turns them into operator dials. Knobs must stay deterministic values; no knob may carry
 * caller state. Standing invariant for the dial session: `ringSpacing` must stay ≥ `minSeparation`,
 * because separation between adjacent rings IS `ringSpacing` — a smaller value defeats the
 * no-overlap gate no matter what the buckets do.
 */
export interface LayoutConfig {
  /** Radial distance between adjacent depth rings, in canvas units. Must be ≥ `minSeparation`. */
  readonly ringSpacing: number;
  /** Minimum center-to-center distance between any two nodes; the no-overlap hard-gate constant. */
  readonly minSeparation: number;
  /** How siblings divide their parent's wedge; the spawn-movement posture. */
  readonly wedgePolicy: WedgePolicy;
  /**
   * How many angular slots apart siblings ideally fan from their parent's heading. Higher values
   * spread branches into a starrier, wider picture; 1 packs them tight. A fan multiplier, not a
   * guarantee — placement still resolves collisions and crossings.
   */
  readonly siblingSpread: number;
  /**
   * Compass headings (radians, clockwise from north in canvas coordinates) that root subtrees claim
   * in creation order. Also fixes the overflow sector's heading for parked orphans.
   */
  readonly directionSequence: readonly number[];
}

/** North, east, south, west, then the diagonals — the order root subtrees claim compass sectors. */
const COMPASS_HEADINGS: readonly number[] = [
  0,
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
];

/**
 * The shipping configuration until 4.0.3.1.2's dials exist. `wedgePolicy: 'fixed-slot'` and the
 * wide `siblingSpread` are the operator-ratified posture from the engine selection gate
 * (session 4.0.3.1.1 G-1, 2026-08-01); the spacing constants echo the provisional grid's scale so
 * the first real layout reads at a familiar zoom.
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  ringSpacing: 240,
  minSeparation: 140,
  wedgePolicy: 'fixed-slot',
  siblingSpread: 3,
  directionSequence: COMPASS_HEADINGS,
};

/**
 * The pure seam (contract HC-1): facts in, one position per input system out.
 *
 * Deterministic — no randomness, clock, or caller state; identical facts and config yield
 * byte-identical positions within a JS engine (pinned by the committed digest fixture). Identity
 * ACROSS engines (D1/D2's every-client goal) additionally rides on `Math.sin`/`Math.cos`/
 * `Math.hypot`, which ECMA-262 lets implementations approximate — closing that gap is a recorded
 * residual 4.0.3.1.2 must settle before wiring the kernel to live clients. Async because the
 * production seam is the worker boundary; rejection is an engine failure, never a production
 * control path.
 */
export type LayoutKernel = (
  facts: LayoutFacts,
  config?: LayoutConfig,
) => Promise<ReadonlyMap<number, ChainPosition>>;

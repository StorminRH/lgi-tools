// The compass-sector engine — the shipped layout engine (operator G-1 selection, 2026-08-01).
//
// CONTRACT (session 4.0.3.1.1, master plan §4.0.3.1): a radial compass tree — root centered, depth
// mapped to rings, root subtrees claiming compass sectors in creation order, siblings subdividing
// their parent's heading in creation order under the configured wedge policy.
//
// Two structural ideas carry every gate:
//
//   1. The bucket registry. Every ring is divided into angular buckets whose arc clears
//      `minSeparation`, and nodes claim buckets in attachment order. A new arrival always attaches
//      — and therefore places — after every existing node, so it can never displace one: under the
//      `fixed-slot` policy adds move nothing by construction, and no two nodes ever share a bucket,
//      so the no-overlap gate holds structurally rather than statistically.
//   2. Crossing-aware claiming. A node does not take the nearest free bucket blindly; it evaluates
//      the free spots near its ideal heading and takes the closest one whose parent edge crosses no
//      already-placed tree edge. Long slanted edges through occupied territory — the one source of
//      tree-tree crossings in a ringed layout — are avoided at placement time, deterministically.
import type { ChainPosition } from '../chain/intents';
import { deriveChainTree, type ChainTree } from './facts';
import { headingVector, segmentsIntersect } from './geometry';
import {
  DEFAULT_LAYOUT_CONFIG,
  SEPARATION_MARGIN,
  type LayoutConfig,
  type LayoutFacts,
  type LayoutKernel,
} from './layout-contract';
import { parkOrphans } from './overflow';

const FULL_CIRCLE = 2 * Math.PI;

/** How many rings outward the crossing-aware pass looks for a home. */
const CANDIDATE_RING_DEPTH = 4;

/** The wider net cast only when every nearby candidate would cross an existing edge. */
const EXTENDED_RING_DEPTH = 8;

/** How many rings the totality sweep spans; far beyond any 60-system chain. */
const MAX_PROBE_RINGS = 64;

/**
 * Angular buckets on one ring. Arc per bucket stays ≥ the separation margin at every ring — the
 * bucket-arc bound is deliberately tight (`SEPARATION_MARGIN`), because every extra point of
 * margin removes ring capacity, and lost capacity pushes children rings deeper, which lengthens
 * edges and invites crossings. Ring 1 additionally caps at the compass so root sectors land on
 * their headings, but never above what separation allows — the overlap gate has exactly one owner.
 */
function bucketCount(ring: number, config: LayoutConfig): number {
  const circumference = FULL_CIRCLE * ring * config.ringSpacing;
  const byArc = Math.max(
    1,
    Math.floor(circumference / (config.minSeparation * SEPARATION_MARGIN)),
  );
  if (ring <= 1) return Math.min(config.directionSequence.length, byArc);
  return byArc;
}

function normalizeAngle(angle: number): number {
  const wrapped = angle % FULL_CIRCLE;
  return wrapped < 0 ? wrapped + FULL_CIRCLE : wrapped;
}

/** Canvas position of a polar spot, on the shared heading convention from `geometry.ts`. */
function toPosition(ring: number, angle: number, config: LayoutConfig): ChainPosition {
  const radius = ring * config.ringSpacing;
  const unit = headingVector(angle);
  return { x: unit.x * radius, y: unit.y * radius };
}

/** Center-out slot offsets: 0, −1, +1, −2, +2, … — how siblings fan around their parent. */
function centerOut(index: number): number {
  if (index === 0) return 0;
  const magnitude = Math.ceil(index / 2);
  return index % 2 === 1 ? -magnitude : magnitude;
}

/** One already-drawn tree edge; the geometry the crossing-aware pass steers around. */
interface PlacedEdge {
  readonly from: ChainPosition;
  readonly to: ChainPosition;
}

/** Crossings the edge `parent`→`candidate` would create, counting stops at `cap`. */
function crossingsUpTo(
  parent: ChainPosition,
  candidate: ChainPosition,
  edges: readonly PlacedEdge[],
  cap: number,
): number {
  let crossings = 0;
  for (const edge of edges) {
    if (segmentsIntersect(parent, candidate, edge.from, edge.to)) {
      crossings += 1;
      if (crossings >= cap) break;
    }
  }
  return crossings;
}

/** One node's claimed spot in the registry. */
interface ClaimedSpot {
  readonly ring: number;
  readonly angle: number;
}

/** A free spot under evaluation, in preference order. */
interface CandidateSpot extends ClaimedSpot {
  readonly bucket: number;
  readonly position: ChainPosition;
}

/** The per-ring bucket occupancy; placement is a pure fold over attachment order. */
class BucketRegistry {
  private readonly taken = new Map<number, Set<number>>();

  constructor(private readonly config: LayoutConfig) {}

  /**
   * Claims the best free spot near (`idealRing`, `idealAngle`) for a node whose parent sits at
   * `parentPosition`: the most-preferred candidate whose parent edge crosses none of `edges`, or
   * the fewest-crossings candidate when a clean one does not exist. Preference order is ring-major
   * center-out, so among equally clean spots the node stays as shallow and as near its ideal
   * heading as the neighborhood allows.
   */
  claim(
    idealRing: number,
    idealAngle: number,
    parentPosition: ChainPosition,
    edges: readonly PlacedEdge[],
  ): ClaimedSpot {
    let best: CandidateSpot | null = null;
    let bestCrossings = Number.POSITIVE_INFINITY;
    for (const extended of [false, true]) {
      for (const candidate of this.candidates(idealRing, idealAngle, extended)) {
        const crossings = crossingsUpTo(
          parentPosition,
          candidate.position,
          edges,
          bestCrossings,
        );
        if (crossings === 0) {
          this.take(candidate);
          return candidate;
        }
        if (crossings < bestCrossings) {
          bestCrossings = crossings;
          best = candidate;
        }
      }
      // A clean spot near the ideal wins outright; only a fully crossed neighborhood widens the
      // net, and only a fully crossed extended net settles for the fewest-crossings spot.
    }
    if (best !== null) {
      this.take(best);
      return best;
    }
    return this.sweep(idealRing, idealAngle);
  }

  /** Free spots near the ideal, ring-major and center-out — the crossing pass's search space. */
  private *candidates(
    idealRing: number,
    idealAngle: number,
    extended: boolean,
  ): Generator<CandidateSpot> {
    const depth = extended ? EXTENDED_RING_DEPTH : CANDIDATE_RING_DEPTH;
    for (let ring = idealRing; ring < idealRing + depth; ring += 1) {
      const buckets = bucketCount(ring, this.config);
      const step = FULL_CIRCLE / buckets;
      const start = Math.round(normalizeAngle(idealAngle) / step) % buckets;
      const window = extended
        ? Math.floor(buckets / 2)
        : Math.max(3, Math.floor(buckets / 8));
      const occupied = this.taken.get(ring);
      for (let sideways = 0; sideways <= 2 * window; sideways += 1) {
        const bucket = (((start + centerOut(sideways)) % buckets) + buckets) % buckets;
        if (occupied?.has(bucket)) continue;
        const angle = bucket * step;
        yield { ring, angle, bucket, position: toPosition(ring, angle, this.config) };
      }
    }
  }

  private take(candidate: CandidateSpot): void {
    const occupied = this.taken.get(candidate.ring) ?? new Set<number>();
    occupied.add(candidate.bucket);
    this.taken.set(candidate.ring, occupied);
  }

  /** Claims the `sideways`-th bucket out from the ideal on one ring, when it is free. */
  private tryTake(ring: number, idealAngle: number, sideways: number): ClaimedSpot | null {
    const buckets = bucketCount(ring, this.config);
    const step = FULL_CIRCLE / buckets;
    const start = Math.round(normalizeAngle(idealAngle) / step) % buckets;
    const bucket = (((start + centerOut(sideways)) % buckets) + buckets) % buckets;
    const occupied = this.taken.get(ring) ?? new Set<number>();
    if (occupied.has(bucket)) return null;
    occupied.add(bucket);
    this.taken.set(ring, occupied);
    return { ring, angle: bucket * step };
  }

  /** Totality fallback: the nearest free bucket anywhere, crossings no longer considered. */
  private sweep(idealRing: number, idealAngle: number): ClaimedSpot {
    for (let ring = idealRing; ring < idealRing + MAX_PROBE_RINGS; ring += 1) {
      for (let sideways = 0; sideways < bucketCount(ring, this.config); sideways += 1) {
        const claimed = this.tryTake(ring, idealAngle, sideways);
        if (claimed !== null) return claimed;
      }
    }
    // Unreachable for any real chain: MAX_PROBE_RINGS of capacity dwarfs the input size. Claiming
    // a distant ring keeps the function total without inventing an overlap.
    return { ring: idealRing + MAX_PROBE_RINGS, angle: normalizeAngle(idealAngle) };
  }
}

/**
 * The ideal heading for one child: its parent's resolved heading plus a slot offset scaled to the
 * child's ring.
 *
 * `fixed-slot`: the offset depends only on the child's own sibling index, so an added sibling
 * changes nothing for existing ones. `proportional`: siblings re-center around the parent heading,
 * so a sector fill re-spreads exactly the sibling group (and the subtrees hanging from it).
 */
function idealChildAngle(
  parentAngle: number,
  siblingIndex: number,
  siblingCount: number,
  ring: number,
  config: LayoutConfig,
): number {
  const step = (FULL_CIRCLE / bucketCount(ring, config)) * config.siblingSpread;
  if (config.wedgePolicy === 'fixed-slot') {
    return parentAngle + centerOut(siblingIndex) * step;
  }
  return parentAngle + (siblingIndex - (siblingCount - 1) / 2) * step;
}

/** Lays out the attached tree by folding the registry over attachment order. */
function layoutTree(tree: ChainTree, config: LayoutConfig): Map<number, ChainPosition> {
  const positions = new Map<number, ChainPosition>();
  if (tree.rootSystemId === null) return positions;

  const registry = new BucketRegistry(config);
  const spots = new Map<number, ClaimedSpot>();
  const edges: PlacedEdge[] = [];

  positions.set(tree.rootSystemId, { x: 0, y: 0 });
  spots.set(tree.rootSystemId, { ring: 0, angle: 0 });

  const sequence = config.directionSequence;
  for (const [index, systemId] of tree.attachmentOrder.entries()) {
    if (index === 0) continue; // The root is already at the origin.
    // Attached non-root systems always have a parent, and parents always attach (and therefore
    // resolve a spot) before their children.
    const parent = tree.parents.get(systemId);
    const parentSpot = parent === undefined ? undefined : spots.get(parent);
    const parentPosition = parent === undefined ? undefined : positions.get(parent);
    if (parent === undefined || parentSpot === undefined || parentPosition === undefined) {
      continue;
    }

    const siblings = tree.childrenInOrder.get(parent) ?? [];
    const siblingIndex = siblings.indexOf(systemId);
    const siblingCount = siblings.length;
    const idealRing = parentSpot.ring + 1;

    const idealAngle =
      parent === tree.rootSystemId
        ? sequence[siblingIndex % sequence.length] ?? 0
        : idealChildAngle(parentSpot.angle, siblingIndex, siblingCount, idealRing, config);

    const spot = registry.claim(idealRing, idealAngle, parentPosition, edges);
    spots.set(systemId, spot);
    const position = toPosition(spot.ring, spot.angle, config);
    positions.set(systemId, position);
    edges.push({ from: parentPosition, to: position });
  }

  return positions;
}

/**
 * The compass candidate behind the pure seam. Synchronous at its core; async only because the
 * seam admits promise-based engines too.
 */
export const compassKernel: LayoutKernel = (
  facts: LayoutFacts,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
) => {
  const tree = deriveChainTree(facts);
  const positions = layoutTree(tree, config);
  parkOrphans(positions, tree.orphans, config);
  return Promise.resolve(positions);
};

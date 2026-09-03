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

const CANDIDATE_RING_DEPTH = 4;

const EXTENDED_RING_DEPTH = 8;

const MAX_PROBE_RINGS = 64;

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

function toPosition(ring: number, angle: number, config: LayoutConfig): ChainPosition {
  const radius = ring * config.ringSpacing;
  const unit = headingVector(angle);
  return { x: unit.x * radius, y: unit.y * radius };
}

function centerOut(index: number): number {
  if (index === 0) return 0;
  const magnitude = Math.ceil(index / 2);
  return index % 2 === 1 ? -magnitude : magnitude;
}

interface PlacedEdge {
  readonly from: ChainPosition;
  readonly to: ChainPosition;
}

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

interface ClaimedSpot {
  readonly ring: number;
  readonly angle: number;
}

interface CandidateSpot extends ClaimedSpot {
  readonly bucket: number;
  readonly position: ChainPosition;
}

class BucketRegistry {
  private readonly taken = new Map<number, Set<number>>();

  constructor(private readonly config: LayoutConfig) {}

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

    }
    if (best !== null) {
      this.take(best);
      return best;
    }
    return this.sweep(idealRing, idealAngle);
  }

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

  private sweep(idealRing: number, idealAngle: number): ClaimedSpot {
    for (let ring = idealRing; ring < idealRing + MAX_PROBE_RINGS; ring += 1) {
      for (let sideways = 0; sideways < bucketCount(ring, this.config); sideways += 1) {
        const claimed = this.tryTake(ring, idealAngle, sideways);
        if (claimed !== null) return claimed;
      }
    }

    return { ring: idealRing + MAX_PROBE_RINGS, angle: normalizeAngle(idealAngle) };
  }
}

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
    if (index === 0) continue;

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

export const compassKernel: LayoutKernel = (
  facts: LayoutFacts,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
) => {
  const tree = deriveChainTree(facts);
  const positions = layoutTree(tree, config);
  parkOrphans(positions, tree.orphans, config);
  return Promise.resolve(positions);
};

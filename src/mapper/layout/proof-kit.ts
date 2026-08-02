// Test-only proof surface for the layout suites: the seeded chain-generator corpus both candidate
// engines are measured on, the geometry predicates the property gates use, and the position digest
// that pins cross-process determinism.
//
// CONTRACT (session 4.0.3.1.1, plan "proof kit placement"): consumed only by the layout suites —
// never by production code. Everything here is seeded and deterministic: the generator uses an
// explicit PRNG (no `Math.random`), corpus seeds are committed constants, and the digest is a pure
// function of positions, so two processes agreeing on a digest proves byte-identical layout.
import type { ChainPosition } from '../chain/intents';
import { deriveChainTree } from './facts';
import { segmentsIntersect } from './geometry';
import type { LayoutFacts } from './layout-contract';
import { distance } from './trig';

/** One committed corpus entry: the seed fixes the chain, the size bounds its system count. */
export interface CorpusEntry {
  readonly seed: number;
  readonly size: number;
}

/**
 * The shared measurement corpus. Every suite runs every entry; sizes span a fresh scan-in to a
 * mature 60-system chain, and across the corpus the generator mixes branching, deep paths, loop
 * closures, duplicate edges, and late-connected orphan phases (most orphans attach later; at
 * least one chain ends with one still parked — multi-orphan clusters are pinned by dedicated
 * cases in the property suites, not by the corpus).
 */
export const PROOF_CORPUS: readonly CorpusEntry[] = [
  { seed: 11, size: 2 },
  { seed: 12, size: 5 },
  { seed: 13, size: 8 },
  { seed: 21, size: 12 },
  { seed: 22, size: 18 },
  { seed: 23, size: 25 },
  { seed: 31, size: 34 },
  { seed: 32, size: 42 },
  { seed: 33, size: 50 },
  { seed: 41, size: 60 },
  { seed: 42, size: 60 },
  { seed: 43, size: 60 },
];

/** Mulberry32: a tiny, well-distributed 32-bit PRNG; the only randomness source in the suites. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic wormhole-shaped system ids: J-space numbers offset by creation index. */
const SYSTEM_ID_BASE = 31_000_000;

/** One generated chain plus the system-count at which each connection was created. */
export interface ChainTimeline {
  readonly facts: LayoutFacts;
  /** `connectionSteps[i]` = how many systems existed when `facts.connections[i]` was scanned. */
  readonly connectionSteps: readonly number[];
}

/** The generator's mutable working state while one chain grows. */
interface ChainGrowth {
  readonly rand: () => number;
  readonly connections: { fromSystemId: number; toSystemId: number }[];
  readonly connectionSteps: number[];
  readonly attached: number[];
  readonly orphans: number[];
}

/** Appends one connection stamped with the current system count. */
function scanConnection(
  growth: ChainGrowth,
  step: number,
  fromSystemId: number,
  toSystemId: number,
): void {
  growth.connections.push({ fromSystemId, toSystemId });
  growth.connectionSteps.push(step);
}

/**
 * A random already-attached system. `attached` always holds the root, so the index read cannot
 * actually miss; the fallback keeps the type total without a non-null assertion.
 */
function randomAttached(growth: ChainGrowth): number {
  const position = Math.floor(growth.rand() * growth.attached.length);
  return growth.attached[position] ?? SYSTEM_ID_BASE + 1;
}

/** One arrival: an orphan phase, a thread extension, or a branch from a random system. */
function spawnStep(growth: ChainGrowth, step: number, systemId: number): void {
  if (growth.rand() < 0.08) {
    // Orphan phase: the system's row lands before its connection does.
    growth.orphans.push(systemId);
    return;
  }
  // Half the growth extends the most recent thread (deep chains), half branches from anywhere.
  const recent = growth.attached[growth.attached.length - 1] ?? SYSTEM_ID_BASE + 1;
  const parent = growth.rand() < 0.5 ? recent : randomAttached(growth);
  scanConnection(growth, step, parent, systemId);
  growth.attached.push(systemId);
}

/** A loop-closing scan: connect two already-attached systems; duplicates are legal facts. */
function maybeCloseLoop(growth: ChainGrowth, step: number): void {
  if (growth.rand() < 0.1 && growth.attached.length >= 2) {
    scanConnection(growth, step, randomAttached(growth), randomAttached(growth));
  }
}

/** The orphan's edge finally drains: it attaches late, exercising blocked-then-drained replay. */
function maybeResolveOrphan(growth: ChainGrowth, step: number): void {
  if (growth.rand() < 0.3 && growth.orphans.length > 0) {
    const orphan = growth.orphans.shift();
    // The shift is guarded by the length check above, so `orphan` is always a value.
    if (orphan !== undefined) {
      scanConnection(growth, step, randomAttached(growth), orphan);
      growth.attached.push(orphan);
    }
  }
}

/**
 * Generates one deterministic chain with its scan timeline: `size` systems in creation order,
 * connections in creation order, and the system-count at which each connection was scanned.
 * Growth mixes path-deepening and branching, closes loops (including occasional duplicate edges),
 * and spawns orphan phases whose connecting edge arrives later or never — the same shapes a live
 * map's draining pages produce.
 */
export function generateChainTimeline(entry: CorpusEntry): ChainTimeline {
  const systemIdOf = (index: number): number => SYSTEM_ID_BASE + index + 1;
  const growth: ChainGrowth = {
    rand: mulberry32(entry.seed),
    connections: [],
    connectionSteps: [],
    attached: [systemIdOf(0)],
    orphans: [],
  };
  const systems = [{ systemId: systemIdOf(0) }];

  for (let index = 1; index < entry.size; index += 1) {
    const systemId = systemIdOf(index);
    systems.push({ systemId });
    const step = index + 1;
    spawnStep(growth, step, systemId);
    maybeCloseLoop(growth, step);
    maybeResolveOrphan(growth, step);
  }

  return {
    facts: { systems, connections: growth.connections },
    connectionSteps: growth.connectionSteps,
  };
}

/** The timeline's final facts — the shape every whole-chain suite consumes. */
export function generateChain(entry: CorpusEntry): LayoutFacts {
  return generateChainTimeline(entry).facts;
}

/**
 * The same chain as it truly existed when `systemCount` systems had spawned: the first
 * `systemCount` systems and exactly the connections scanned by then. Filtering by scan step —
 * not by endpoint membership — keeps late orphan-resolution edges out of earlier prefixes, so the
 * growth suites replay real histories rather than counterfeit ones.
 */
export function chainPrefix(timeline: ChainTimeline, systemCount: number): LayoutFacts {
  const systems = timeline.facts.systems.slice(0, systemCount);
  const connections = timeline.facts.connections.filter(
    (_edge, index) =>
      (timeline.connectionSteps[index] ?? Number.POSITIVE_INFINITY) <= systemCount,
  );
  return { systems, connections };
}

/** Every pair of positions closer than `minSeparation`, center to center. Empty means no overlap. */
export function separationViolations(
  positions: ReadonlyMap<number, ChainPosition>,
  minSeparation: number,
): readonly { a: number; b: number; distance: number }[] {
  const entries = [...positions.entries()];
  const violations: { a: number; b: number; distance: number }[] = [];
  for (const [i, [aId, aPos]] of entries.entries()) {
    for (const [bId, bPos] of entries.slice(i + 1)) {
      const pairDistance = distance(aPos, bPos);
      if (pairDistance < minSeparation) {
        violations.push({ a: aId, b: bId, distance: pairDistance });
      }
    }
  }
  return violations;
}


/**
 * The systems from `before` whose position changed or that are absent from `after`. Additions are
 * arrivals, not moves, and are never counted. This is the moved-set the stability scorecard rows
 * record.
 */
export function movedSystems(
  before: ReadonlyMap<number, ChainPosition>,
  after: ReadonlyMap<number, ChainPosition>,
): readonly number[] {
  const moved: number[] = [];
  for (const [systemId, position] of before) {
    const next = after.get(systemId);
    if (next === undefined || next.x !== position.x || next.y !== position.y) {
      moved.push(systemId);
    }
  }
  return moved;
}

/** What one layout's edge geometry looks like: crossings split by whether a non-tree edge is involved. */
export interface CrossingReport {
  /** Crossing pairs where both segments are spanning-tree edges — the DC-4 hard boundary. */
  readonly treeTreeCrossings: number;
  /**
   * Crossing pairs involving at least one non-tree drawn edge — loop closures, duplicates, and
   * unclassified orphan links. Permitted by DC-4, counted for aesthetics.
   */
  readonly loopCrossings: number;
}

interface LayoutSegment {
  readonly from: ChainPosition;
  readonly to: ChainPosition;
  readonly loop: boolean;
}

/**
 * Every drawn edge of a laid-out chain as a segment: one spanning-tree segment per attached child,
 * and every other connection whose two distinct endpoints both have positions — loop-closing edges
 * AND still-unclassified connections between parked orphans, because the canvas draws a connection
 * whenever both endpoints are present, classified or not. Self edges have no segment.
 */
function layoutSegments(
  facts: LayoutFacts,
  positions: ReadonlyMap<number, ChainPosition>,
): LayoutSegment[] {
  const tree = deriveChainTree(facts);
  const segments: LayoutSegment[] = [];
  const treeSlotUsed = new Set<number>();
  for (const edge of facts.connections) {
    const from = positions.get(edge.fromSystemId);
    const to = positions.get(edge.toSystemId);
    if (from === undefined || to === undefined || edge.fromSystemId === edge.toSystemId) {
      continue;
    }
    // The first connection instance matching a child's parent link is the tree edge (attachment
    // consumes connections in creation order); every other drawn connection — later duplicates,
    // loop closures, orphan-to-orphan links — is a non-tree segment.
    if (tree.parents.get(edge.toSystemId) === edge.fromSystemId && !treeSlotUsed.has(edge.toSystemId)) {
      treeSlotUsed.add(edge.toSystemId);
      segments.push({ from, to, loop: false });
    } else if (
      tree.parents.get(edge.fromSystemId) === edge.toSystemId &&
      !treeSlotUsed.has(edge.fromSystemId)
    ) {
      treeSlotUsed.add(edge.fromSystemId);
      segments.push({ from, to, loop: false });
    } else {
      segments.push({ from, to, loop: true });
    }
  }
  return segments;
}

/**
 * Counts edge crossings in a laid-out chain, classifying each crossing pair by whether it involves
 * a loop-closing edge.
 */
export function crossingReport(
  facts: LayoutFacts,
  positions: ReadonlyMap<number, ChainPosition>,
): CrossingReport {
  const segments = layoutSegments(facts, positions);
  let treeTreeCrossings = 0;
  let loopCrossings = 0;
  for (const [i, first] of segments.entries()) {
    for (const second of segments.slice(i + 1)) {
      if (segmentsIntersect(first.from, first.to, second.from, second.to)) {
        if (first.loop || second.loop) loopCrossings += 1;
        else treeTreeCrossings += 1;
      }
    }
  }
  return { treeTreeCrossings, loopCrossings };
}

/**
 * A deterministic FNV-1a 64-bit digest of a positions map, keyed independent of map insertion
 * order. Two processes producing the same digest for the same facts is the cross-process
 * determinism proof (SC-2.2); the serialization uses exact `String(number)` forms, so any bit-level
 * position drift changes the digest.
 */
export function positionDigest(
  positions: ReadonlyMap<number, ChainPosition>,
): string {
  const serialized = [...positions.entries()]
    .sort(([a], [b]) => a - b)
    .map(([systemId, position]) => `${systemId}:${position.x},${position.y}`)
    .join(';');

  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < serialized.length; i += 1) {
    hash ^= BigInt(serialized.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

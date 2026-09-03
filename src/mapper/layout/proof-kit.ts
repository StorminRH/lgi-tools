import type { ChainPosition } from '../chain/intents';
import { mulberry32 } from '../lib/prng';
import { deriveChainTree } from './facts';
import { segmentsIntersect } from './geometry';
import type { LayoutFacts } from './layout-contract';
import { distance } from './trig';

export interface CorpusEntry {
  readonly seed: number;
  readonly size: number;
}

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

const SYSTEM_ID_BASE = 31_000_000;

export interface ChainTimeline {
  readonly facts: LayoutFacts;
  readonly connectionSteps: readonly number[];
}

interface ChainGrowth {
  readonly rand: () => number;
  readonly connections: { fromSystemId: number; toSystemId: number }[];
  readonly connectionSteps: number[];
  readonly attached: number[];
  readonly orphans: number[];
}

function scanConnection(
  growth: ChainGrowth,
  step: number,
  fromSystemId: number,
  toSystemId: number,
): void {
  growth.connections.push({ fromSystemId, toSystemId });
  growth.connectionSteps.push(step);
}

function randomAttached(growth: ChainGrowth): number {
  const position = Math.floor(growth.rand() * growth.attached.length);
  return growth.attached[position] ?? SYSTEM_ID_BASE + 1;
}

function spawnStep(growth: ChainGrowth, step: number, systemId: number): void {
  if (growth.rand() < 0.08) {
    growth.orphans.push(systemId);
    return;
  }
  const recent = growth.attached[growth.attached.length - 1] ?? SYSTEM_ID_BASE + 1;
  const parent = growth.rand() < 0.5 ? recent : randomAttached(growth);
  scanConnection(growth, step, parent, systemId);
  growth.attached.push(systemId);
}

function maybeCloseLoop(growth: ChainGrowth, step: number): void {
  if (growth.rand() < 0.1 && growth.attached.length >= 2) {
    scanConnection(growth, step, randomAttached(growth), randomAttached(growth));
  }
}

function maybeResolveOrphan(growth: ChainGrowth, step: number): void {
  if (growth.rand() < 0.3 && growth.orphans.length > 0) {
    const orphan = growth.orphans.shift();
    if (orphan !== undefined) {
      scanConnection(growth, step, randomAttached(growth), orphan);
      growth.attached.push(orphan);
    }
  }
}

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

export function generateChain(entry: CorpusEntry): LayoutFacts {
  return generateChainTimeline(entry).facts;
}

export function chainPrefix(timeline: ChainTimeline, systemCount: number): LayoutFacts {
  const systems = timeline.facts.systems.slice(0, systemCount);
  const connections = timeline.facts.connections.filter(
    (_edge, index) =>
      (timeline.connectionSteps[index] ?? Number.POSITIVE_INFINITY) <= systemCount,
  );
  return { systems, connections };
}

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

export interface CrossingReport {
  readonly treeTreeCrossings: number;
  readonly loopCrossings: number;
}

interface LayoutSegment {
  readonly from: ChainPosition;
  readonly to: ChainPosition;
  readonly loop: boolean;
}

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

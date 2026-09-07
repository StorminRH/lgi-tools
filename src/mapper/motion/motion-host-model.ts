import type { ChainNode } from '../canvas/SystemNode';
import type { ChainEdge } from '../chain/nodes';
import type { ChainPosition, MapChainIntent } from '../chain/intents';
import type {
  EdgeFlavor,
  EdgeMotion,
  MotionPhase,
  NodeMotion,
  TweenPlan,
} from './motion-contract';
import {
  adoptIntents,
  createMotionState,
  finishAllTweens,
  isIdle,
  stepMotion,
  type MotionState,
} from './tween-model';

export interface MotionTruth {
  readonly nodes: readonly ChainNode[];
  readonly edges: readonly ChainEdge[];
  readonly treeParents: ReadonlyMap<number, number>;
}

export interface MotionPresentation {
  readonly nodes: ChainNode[];
  readonly edges: ChainEdge[];
}

export interface MotionHostState {
  readonly consumed: readonly MapChainIntent[];
  readonly motion: MotionState;
  readonly displacements: ReadonlyMap<number, ChainPosition>;
  readonly ghostNodes: ReadonlyMap<number, ChainNode>;
  readonly ghostEdges: ReadonlyMap<string, ChainEdge>;
  readonly knownEdges: ReadonlyMap<string, ChainEdge>;
}

function edgesById(
  edges: readonly ChainEdge[],
): ReadonlyMap<string, ChainEdge> {
  return new Map(edges.map((edge) => [edge.id, edge]));
}

export function createHostState(
  intents: readonly MapChainIntent[],
  edges: readonly ChainEdge[] = [],
): MotionHostState {
  return {
    consumed: intents,
    motion: createMotionState(),
    displacements: new Map(),
    ghostNodes: new Map(),
    ghostEdges: new Map(),
    knownEdges: edgesById(edges),
  };
}

export interface MergeInput {
  readonly truth: MotionTruth;
  readonly intents: readonly MapChainIntent[];
  readonly now: number;
  readonly plan: TweenPlan;
  readonly flavor: EdgeFlavor;
}

function pruneToLive<Key, Snapshot>(
  snapshots: ReadonlyMap<Key, Snapshot>,
  live: ReadonlyMap<Key, unknown>,
): ReadonlyMap<Key, Snapshot> {
  if (snapshots.size === 0) return snapshots;
  let stale = false;
  for (const key of snapshots.keys()) {
    if (!live.has(key)) {
      stale = true;
      break;
    }
  }
  if (!stale) return snapshots;
  const kept = new Map<Key, Snapshot>();
  for (const [key, value] of snapshots) {
    if (live.has(key)) kept.set(key, value);
  }
  return kept;
}

function captureGhostNodes(
  previous: ReadonlyMap<number, ChainNode>,
  motion: MotionState,
  truth: MotionTruth,
): ReadonlyMap<number, ChainNode> {
  const captured = new Map(pruneToLive(previous, motion.ghosts));
  for (const [systemId, ghost] of motion.ghosts) {
    if (captured.has(systemId)) continue;
    const node = truth.nodes.find((candidate) => candidate.id === String(systemId));
    if (node === undefined) continue;
    captured.set(systemId, {
      ...node,
      selected: false,
      draggable: false,
      selectable: false,
      className: 'map-ghost',
      style: { pointerEvents: 'none' },
      data: { ...node.data, motion: { phase: 'departing', heavy: ghost.heavy } },
    });
  }
  return captured;
}

function captureGhostEdges(
  previous: ReadonlyMap<string, ChainEdge>,
  motion: MotionState,
  knownEdges: ReadonlyMap<string, ChainEdge>,
  treeParents: ReadonlyMap<number, number>,
  flavor: EdgeFlavor,
): ReadonlyMap<string, ChainEdge> {
  const captured = new Map(pruneToLive(previous, motion.edgeGhosts));
  for (const [connectionId, ghost] of motion.edgeGhosts) {
    if (captured.has(connectionId)) continue;
    const edge = knownEdges.get(connectionId);
    if (edge === undefined) continue;
    captured.set(connectionId, {
      ...edge,
      data: {
        ...edge.data,
        motion: edgeMotionFor(edge, 'departing', flavor, treeParents, ghost.heavy),
      },
    });
  }
  return captured;
}

export function consumeMerge(
  previous: MotionHostState,
  input: MergeInput,
): MotionHostState {
  const motion = adoptIntents(previous.motion, input.intents, input.now, input.plan);
  const frame = stepMotion(motion, input.now, input.plan.ease);
  return {
    consumed: input.intents,
    motion: frame.state,
    displacements: frame.displacements,
    ghostNodes: captureGhostNodes(previous.ghostNodes, frame.state, input.truth),
    ghostEdges: captureGhostEdges(
      previous.ghostEdges,
      frame.state,
      previous.knownEdges,
      input.truth.treeParents,
      input.flavor,
    ),
    knownEdges: edgesById(input.truth.edges),
  };
}

export function adjustHostForRender(
  host: MotionHostState,
  input: MergeInput & { readonly access: boolean | undefined },
): MotionHostState | null {
  if (input.access === false) {
    if (!isIdle(host.motion) || host.consumed !== input.intents) {
      return createHostState(input.intents, input.truth.edges);
    }
    return null;
  }
  if (host.consumed === input.intents) return null;
  return consumeMerge(host, input);
}

export interface HostStep {
  readonly next: MotionHostState;
  readonly active: boolean;
  readonly changed: boolean;
}

export function stepHost(
  previous: MotionHostState,
  now: number,
  ease: (t: number) => number,
  reducedMotion: boolean,
): HostStep {
  const motion = reducedMotion
    ? finishAllTweens(previous.motion)
    : previous.motion;
  const frame = stepMotion(motion, now, ease);
  if (!frame.changed && motion === previous.motion) {
    return { next: previous, active: frame.active, changed: false };
  }
  return {
    next: {
      consumed: previous.consumed,
      motion: frame.state,
      displacements: frame.displacements,
      ghostNodes: pruneToLive(previous.ghostNodes, frame.state.ghosts),
      ghostEdges: pruneToLive(previous.ghostEdges, frame.state.edgeGhosts),
      knownEdges: previous.knownEdges,
    },
    active: frame.active,
    changed: true,
  };
}

export function edgeMotionFor(
  edge: ChainEdge,
  phase: MotionPhase,
  flavor: EdgeFlavor,
  treeParents: ReadonlyMap<number, number>,
  heavy: boolean,
): EdgeMotion {
  if (edge.data.loop || flavor === 'fade-with-child') {
    return { phase, flavor: 'fade', reverse: false, heavy };
  }
  const reverse = treeParents.get(Number(edge.source)) === Number(edge.target);
  return { phase, flavor: 'grow', reverse, heavy };
}

function nodeMotionOf(
  host: MotionHostState,
  systemId: number,
): NodeMotion | undefined {
  const ghost = host.motion.ghosts.get(systemId);
  if (ghost !== undefined) return { phase: 'departing', heavy: ghost.heavy };
  return host.motion.entering.has(systemId) ? { phase: 'entering' } : undefined;
}

function deriveNode(
  node: ChainNode,
  host: MotionHostState,
): ChainNode {
  if (node.data.stub !== undefined) return node;
  const systemId = Number(node.id);
  const displaced = host.displacements.get(systemId);
  const motion = nodeMotionOf(host, systemId);
  if (displaced === undefined && motion === undefined) return node;
  return {
    ...node,
    position: displaced ?? node.position,
    data: motion === undefined ? node.data : { ...node.data, motion },
  };
}

function appendGhostNodes(
  derived: ChainNode[],
  truth: MotionTruth,
  host: MotionHostState,
): ChainNode[] {
  if (host.ghostNodes.size === 0) return derived;
  const present = new Set(truth.nodes.map((node) => node.id));
  for (const [systemId, ghostNode] of host.ghostNodes) {
    if (!present.has(String(systemId))) derived.push(ghostNode);
  }
  return derived;
}

function deriveNodes(
  truth: MotionTruth,
  host: MotionHostState,
): ChainNode[] {
  return appendGhostNodes(
    truth.nodes.map((node) => deriveNode(node, host)),
    truth,
    host,
  );
}

function deriveEdges(
  truth: MotionTruth,
  host: MotionHostState,
  flavor: EdgeFlavor,
): ChainEdge[] {
  const derived: ChainEdge[] = [];
  for (const edge of truth.edges) {
    const entering = host.motion.edgeEntering.has(edge.id);
    const ghost = host.motion.edgeGhosts.get(edge.id);
    if (!entering && ghost === undefined) {
      derived.push(edge);
      continue;
    }
    const phase = ghost !== undefined ? ('departing' as const) : ('entering' as const);
    derived.push({
      ...edge,
      data: {
        ...edge.data,
        motion: edgeMotionFor(edge, phase, flavor, truth.treeParents, ghost?.heavy ?? false),
      },
    });
  }
  if (host.ghostEdges.size > 0) {
    const present = new Set(truth.edges.map((edge) => edge.id));
    for (const [connectionId, ghostEdge] of host.ghostEdges) {
      if (!present.has(connectionId)) derived.push(ghostEdge);
    }
  }
  return derived;
}

export function derivePresentation(
  truth: MotionTruth,
  host: MotionHostState,
  flavor: EdgeFlavor,
): MotionPresentation {
  return {
    nodes: deriveNodes(truth, host),
    edges: deriveEdges(truth, host, flavor),
  };
}

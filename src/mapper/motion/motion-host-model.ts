// The pure half of the motion derivation host: reconciled truth plus the
// tween scheduler in, the rendered presentation arrays out — as data, with
// every timestamp an argument.
//
// One position authority (plan hard constraint): `ChainHost`'s controlled
// nodes state stays reconciled truth with its two existing writers; this model
// derives what the canvas actually renders — truth overlaid with the
// scheduler's displacements, entering flags, and clock-bounded ghosts — and is
// driven ONLY by `use-motion.ts`'s hook in production. Keeping the state
// machine here, apart from the hook, preserves the pure-model/thin-host split
// the sibling models follow (`tween-model.ts`, `camera-follow-model.ts`) while
// keeping the hook file's exports too narrow for a second consumer to open a
// second position channel.
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

/** The truth arrays the host derives from — `ChainHost`'s, never a copy. */
export interface MotionTruth {
  readonly nodes: readonly ChainNode[];
  readonly edges: readonly ChainEdge[];
  readonly treeParents: ReadonlyMap<number, number>;
}

/** What `ChainSurface` renders. */
export interface MotionPresentation {
  readonly nodes: ChainNode[];
  readonly edges: ChainEdge[];
}

/**
 * The host's whole state: the scheduler plus what the scheduler cannot know —
 * which batch was already consumed, and the departed nodes'/edges' last truth
 * snapshots that ghosts render from.
 */
export interface MotionHostState {
  readonly consumed: readonly MapChainIntent[];
  readonly motion: MotionState;
  readonly displacements: ReadonlyMap<number, ChainPosition>;
  readonly ghostNodes: ReadonlyMap<number, ChainNode>;
  readonly ghostEdges: ReadonlyMap<string, ChainEdge>;
  /**
   * The edge array as of the PREVIOUS merge, by id — the ghost capture
   * source. Nodes sync one commit late (`ChainHost`'s passive effect), so a
   * departing node is still in truth at adoption; the edge memo recomputes in
   * the merge commit itself, so a departing edge is ALREADY GONE from truth
   * when its departure intent arrives. Without this memory, edge exits could
   * never render and every departing line would pop instead of playing its
   * flavor.
   */
  readonly knownEdges: ReadonlyMap<string, ChainEdge>;
}

/** The previous-merge edge memory, rebuilt from one truth array. */
function edgesById(
  edges: readonly ChainEdge[],
): ReadonlyMap<string, ChainEdge> {
  return new Map(edges.map((edge) => [edge.id, edge]));
}

/**
 * A fresh, idle host that treats `intents` as already consumed — mounting (or
 * an access reset) never replays history as motion. `edges` seeds the ghost
 * capture memory with the mount-time truth.
 */
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

/** Everything one adoption needs. */
export interface MergeInput {
  readonly truth: MotionTruth;
  readonly intents: readonly MapChainIntent[];
  readonly now: number;
  readonly plan: TweenPlan;
  readonly dragging: ReadonlySet<number>;
  readonly flavor: EdgeFlavor;
}

/** Keeps only snapshot entries whose ghost is still scheduled. */
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

/**
 * Captures ghost node snapshots for newly departed ids from pre-merge truth.
 * `ChainHost` syncs its nodes in a passive effect, so at adoption time the
 * truth array still holds every departing node.
 */
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
      // Inline, not a stylesheet rule: React Flow writes `pointerEvents` as an
      // inline style computed from the interaction props (and the forwarded
      // `onNodeClick` makes that computation truthy), and the node-level style
      // spread is what wins over it. A class rule can never beat the library's
      // inline value, so this is the one place the "no interaction may target
      // a ghost" invariant can actually hold.
      style: { pointerEvents: 'none' },
      data: { ...node.data, motion: { phase: 'departing', heavy: ghost.heavy } },
    });
  }
  return captured;
}

/**
 * The edge counterpart of `captureGhostNodes` — sourced from the
 * previous-merge edge memory, because a departing edge has already left the
 * truth array in the very commit that announces its departure.
 */
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

/**
 * Folds one new intent batch into the host: adopt, capture ghost snapshots
 * while truth still holds the departing entries, and advance to `now` so a
 * fresh tween's first rendered position is its origin — never its raw target.
 */
export function consumeMerge(
  previous: MotionHostState,
  input: MergeInput,
): MotionHostState {
  const motion = adoptIntents(previous.motion, input.intents, input.now, input.plan);
  const frame = stepMotion(motion, input.now, input.plan.ease, input.dragging);
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

/**
 * The one render-time decision: what (if anything) the host state becomes for
 * this render. `null` means no adjustment. Access loss resets the whole
 * motion state; in the current component tree `ChainLive` unmounts the hook
 * behind the calm no-access panel before this branch could fire, so the reset
 * is a defensive invariant for any future tree that renders both — it is not
 * reachable today. Otherwise a not-yet-consumed batch is folded in.
 */
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

/** One frame-loop advance. */
export interface HostStep {
  readonly next: MotionHostState;
  readonly active: boolean;
  readonly changed: boolean;
}

/**
 * Advances the host one frame. A live reduced-motion flip resolves every
 * glide instantly (DC-6); ghost snapshot maps shed entries as their windows
 * expire.
 */
export function stepHost(
  previous: MotionHostState,
  now: number,
  ease: (t: number) => number,
  dragging: ReadonlySet<number>,
  reducedMotion: boolean,
): HostStep {
  const motion = reducedMotion
    ? finishAllTweens(previous.motion)
    : previous.motion;
  const frame = stepMotion(motion, now, ease, dragging);
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

/** The motion presentation for one edge; exported for the derivation tests. */
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
  // Grow from the parent end: reverse the draw when the geometric source is
  // the child of the pair.
  const reverse = treeParents.get(Number(edge.source)) === Number(edge.target);
  return { phase, flavor: 'grow', reverse, heavy };
}

/**
 * A node's live motion flag. A truth node with a live ghost entry exists only
 * for the one commit before the sync effect removes it; flagging it departing
 * immediately starts the exit without waiting for that commit.
 */
function nodeMotionOf(
  host: MotionHostState,
  systemId: number,
): NodeMotion | undefined {
  const ghost = host.motion.ghosts.get(systemId);
  if (ghost !== undefined) return { phase: 'departing', heavy: ghost.heavy };
  return host.motion.entering.has(systemId) ? { phase: 'entering' } : undefined;
}

/**
 * One node's derivation. Identity preservation is the frame budget's backbone
 * — a node with no displacement or flag passes through as the same object
 * reference, and a dragged node always does (HC-2).
 */
function deriveNode(
  node: ChainNode,
  host: MotionHostState,
  dragging: ReadonlySet<number>,
): ChainNode {
  // Stub ids name connection documents rather than numeric systems and carry
  // no reconciler intents. Their kernel-owned presentation passes through.
  if (node.data.stub !== undefined) return node;
  const systemId = Number(node.id);
  if (dragging.has(systemId)) return node;
  const displaced = host.displacements.get(systemId);
  const motion = nodeMotionOf(host, systemId);
  if (displaced === undefined && motion === undefined) return node;
  return {
    ...node,
    position: displaced ?? node.position,
    data: motion === undefined ? node.data : { ...node.data, motion },
  };
}

/** Appends ghost snapshots whose ids have already left the truth array. */
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

/** Derives the rendered node array: truth overlaid, ghosts appended. */
function deriveNodes(
  truth: MotionTruth,
  host: MotionHostState,
  dragging: ReadonlySet<number>,
): ChainNode[] {
  return appendGhostNodes(
    truth.nodes.map((node) => deriveNode(node, host, dragging)),
    truth,
    host,
  );
}

/** Derives the rendered edge array; the edge counterpart of `deriveNodes`. */
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

/** The full derivation, exported pure so the host tests drive it directly. */
export function derivePresentation(
  truth: MotionTruth,
  host: MotionHostState,
  dragging: ReadonlySet<number>,
  flavor: EdgeFlavor,
): MotionPresentation {
  return {
    nodes: deriveNodes(truth, host, dragging),
    edges: deriveEdges(truth, host, flavor),
  };
}

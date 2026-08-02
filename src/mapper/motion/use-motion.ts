'use client';

// The motion derivation host: reconciled truth plus the tween scheduler in,
// the rendered presentation arrays out.
//
// One position authority (plan hard constraint): `ChainHost`'s controlled
// nodes state stays reconciled truth with its two existing writers; this hook
// derives what the canvas actually renders — truth overlaid with the
// scheduler's displacements, entering flags, and clock-bounded ghosts — in the
// SAME React commit that truth changes, so no teleport-and-return frame can
// paint and edges track their endpoints by construction (HC-1: edges read the
// rendered array's positions, and there is no second position channel).
//
// Intent batches are consumed exactly once by identity (the camera's
// discipline), during render through the adjust-state-while-rendering pattern —
// an effect would arrive one commit late and let a `system-moved` merge paint
// one frame at its raw target.
//
// The requestAnimationFrame loop runs only while the scheduler is active and
// unregisters when it drains (HC-5). Every environment dependency — clock,
// frame scheduling, reduced-motion — is injected (`MotionSeams`), following
// the `live-price.tsx` scheduler-seam pattern. The live drag set arrives as
// committed state for render-time derivation and is mirrored into a hook-owned
// ref for the frame callbacks (the `ChainHost` mirror pattern), so cancel-on-
// drag cannot go stale across the async frame window without any render-time
// ref read.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChainNode, NodeMotion } from '../canvas/SystemNode';
import type { ChainEdge, EdgeMotion } from '../chain/nodes';
import type { ChainPosition, MapChainIntent } from '../chain/intents';
import {
  browserPrefersReducedMotion,
  tweenPlanOf,
  type EdgeFlavor,
  type MotionConfig,
  type PrefersReducedMotion,
  type TweenPlan,
} from './motion-contract';
import {
  adoptIntents,
  createMotionState,
  finishAllTweens,
  isIdle,
  stepMotion,
  type MotionState,
} from './tween-model';

/** Environment dependencies, injectable for tests (`live-price.tsx` pattern). */
export interface MotionSeams {
  readonly now: () => number;
  readonly requestFrame: (callback: () => void) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly prefersReducedMotion: PrefersReducedMotion;
}

/**
 * The browser-backed seams — a module constant, so its identity never churns
 * a dependency list. Every closure calls through `window`/`performance` at
 * invocation time (extracting `requestAnimationFrame` as a bare function
 * throws TypeError), so constructing this during import is side-effect-free.
 */
export const BROWSER_MOTION_SEAMS: MotionSeams = {
  now: () => performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(() => callback()),
  cancelFrame: (handle) => window.cancelAnimationFrame(handle),
  prefersReducedMotion: browserPrefersReducedMotion,
};

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
 * motion state (no ghost storm behind the calm panel; a re-grant starts
 * clean); otherwise a not-yet-consumed batch is folded in.
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
  phase: 'entering' | 'departing',
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

/**
 * The React host. Consumes each distinct `intents` array exactly once by
 * identity; empty or repeated arrays schedule nothing; `access === false`
 * resets the whole motion state so no ghost set animates behind the calm
 * no-access panel and a re-grant starts clean (the panel replaces this
 * surface, but the reset holds even while both states coexist in one commit).
 */
export function useMotion(
  truth: MotionTruth,
  intents: readonly MapChainIntent[],
  access: boolean | undefined,
  dragging: ReadonlySet<number>,
  config: MotionConfig,
  seams: MotionSeams,
): MotionPresentation {
  const [host, setHost] = useState<MotionHostState>(() =>
    createHostState(intents, truth.edges),
  );
  const plan = useMemo(() => tweenPlanOf(config, false), [config]);

  // Mirrors the committed drag set for the frame callbacks (the ChainHost
  // mirror pattern): render-time work uses the prop, async work the ref.
  const draggingRef = useRef(dragging);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  // Adjust-state-while-rendering: adoption must land in the same commit as the
  // truth it accompanies, or a forced move paints one frame at its raw target.
  // The guard also keeps the environment seams unread on quiet renders (and in
  // server rendering, where no batch can ever be unconsumed).
  let live = host;
  if (access === false || host.consumed !== intents) {
    const adjusted = adjustHostForRender(host, {
      truth,
      intents,
      access,
      now: seams.now(),
      plan: seams.prefersReducedMotion() ? { ...plan, moveMs: 0 } : plan,
      dragging,
      flavor: config.edgeFlavor,
    });
    if (adjusted !== null) {
      live = adjusted;
      setHost(adjusted);
    }
  }

  useEffect(() => {
    if (isIdle(host.motion)) return;
    let cancelled = false;
    let handle = 0;
    const tick = () => {
      if (cancelled) return;
      const step = stepHost(
        host,
        seams.now(),
        plan.ease,
        draggingRef.current,
        seams.prefersReducedMotion(),
      );
      if (step.changed) {
        // The state change re-runs this effect, which schedules the next frame.
        setHost(step.next);
        return;
      }
      if (step.active) handle = seams.requestFrame(tick);
    };
    handle = seams.requestFrame(tick);
    return () => {
      cancelled = true;
      seams.cancelFrame(handle);
    };
  }, [host, plan, seams]);

  return derivePresentation(truth, live, dragging, config.edgeFlavor);
}

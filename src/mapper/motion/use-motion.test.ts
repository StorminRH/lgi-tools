// The derivation host's pure pipeline, driven exactly as the thin React hook
// drives it: adjust-for-render on each simulated commit, stepHost per injected
// clock frame, derivePresentation for what the canvas would paint.
import { describe, expect, it } from 'vitest';
import type { ChainNode } from '../canvas/SystemNode';
import type { ChainEdge } from '../chain/nodes';
import type { MapChainIntent } from '../chain/intents';
import { springFamily, tweenPlanOf, DEFAULT_MOTION_CONFIG } from './motion-contract';
import {
  adjustHostForRender,
  consumeMerge,
  createHostState,
  derivePresentation,
  edgeMotionFor,
  stepHost,
  type MotionHostState,
  type MotionTruth,
} from './use-motion';

const PLAN = tweenPlanOf(DEFAULT_MOTION_CONFIG, false);
const EASE = springFamily(DEFAULT_MOTION_CONFIG.overshootPct).ease;
const NONE: ReadonlySet<number> = new Set();
const FLAVOR = DEFAULT_MOTION_CONFIG.edgeFlavor;

const node = (systemId: number, x: number, y: number): ChainNode => ({
  id: String(systemId),
  type: 'chainSystem',
  position: { x, y },
  data: { name: `J${systemId}`, className: null },
});

const edge = (
  id: string,
  source: number,
  target: number,
  loop = false,
): ChainEdge => ({
  id,
  source: String(source),
  target: String(target),
  data: { loop },
});

const truthOf = (
  nodes: readonly ChainNode[],
  edges: readonly ChainEdge[] = [],
  treeParents: ReadonlyMap<number, number> = new Map(),
): MotionTruth => ({ nodes, edges, treeParents });

const moved = (
  systemId: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): MapChainIntent => ({ kind: 'system-moved', systemId, from, to });

const mergeInput = (
  truth: MotionTruth,
  intents: readonly MapChainIntent[],
  now: number,
  dragging: ReadonlySet<number> = NONE,
) => ({ truth, intents, now, plan: PLAN, dragging, flavor: FLAVOR });

// ── SC-2.1 · DC-2 — glides step from the intent's own origin ─────────────────
describe('glide derivation', () => {
  it('renders a fresh tween at its origin in the adoption commit, then steps along the spring', () => {
    const preMerge = truthOf([node(31, 0, 0), node(32, 500, 500)]);
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    const host = consumeMerge(createHostState([]), mergeInput(preMerge, intents, 0));

    const atAdoption = derivePresentation(preMerge, host, NONE, FLAVOR);
    expect(atAdoption.nodes[0]?.position).toEqual({ x: 0, y: 0 });

    const half = stepHost(host, PLAN.moveMs / 2, EASE, NONE, false);
    const midway = derivePresentation(preMerge, half.next, NONE, FLAVOR);
    expect(midway.nodes[0]?.position.x).toBeCloseTo(100 * EASE(0.5), 6);
  });

  it('yields no frame at the raw target when truth commits mid-glide', () => {
    const preMerge = truthOf([node(31, 0, 0)]);
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    const host = consumeMerge(createHostState([]), mergeInput(preMerge, intents, 0));

    // The sync effect commits the reconciled target one commit later; the
    // derivation must keep overlaying the displaced value in that commit.
    const postMerge = truthOf([node(31, 100, 0)]);
    const commit = derivePresentation(postMerge, host, NONE, FLAVOR);
    expect(commit.nodes[0]?.position).toEqual({ x: 0, y: 0 });

    // And every stepped frame stays strictly between origin and target until
    // the glide completes.
    const half = stepHost(host, PLAN.moveMs / 2, EASE, NONE, false);
    const midway = derivePresentation(postMerge, half.next, NONE, FLAVOR);
    expect(midway.nodes[0]?.position.x).toBeGreaterThan(0);
    expect(midway.nodes[0]?.position.x).not.toBe(100);
  });

  it('hands the node back to truth by reference when the glide completes', () => {
    const postMerge = truthOf([node(31, 100, 0)]);
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    const host = consumeMerge(createHostState([]), mergeInput(postMerge, intents, 0));

    const done = stepHost(host, PLAN.moveMs + 1, EASE, NONE, false);
    const settled = derivePresentation(postMerge, done.next, NONE, FLAVOR);
    expect(settled.nodes[0]).toBe(postMerge.nodes[0]);
    expect(done.active).toBe(false);
  });
});

// ── Plan hard constraint — identity preservation bounds the React commit ─────
describe('identity preservation', () => {
  it('passes unmoved nodes through as the same object reference frame over frame', () => {
    const bystander = node(32, 500, 500);
    const truth = truthOf([node(31, 0, 0), bystander]);
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    let host = consumeMerge(createHostState([]), mergeInput(truth, intents, 0));

    for (const now of [100, 200, 300]) {
      host = stepHost(host, now, EASE, NONE, false).next;
      const frame = derivePresentation(truth, host, NONE, FLAVOR);
      expect(frame.nodes[1]).toBe(bystander);
    }
  });

  it('passes a dragged node through untouched even while it has a live tween', () => {
    const dragged = node(31, 42, 43);
    const truth = truthOf([dragged]);
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    const host = consumeMerge(createHostState([]), mergeInput(truth, intents, 0));

    const frame = derivePresentation(truth, host, new Set([31]), FLAVOR);
    expect(frame.nodes[0]).toBe(dragged);
  });

  it('leaves edges untouched by reference when nothing about them animates', () => {
    const plain = edge('c1', 31, 32);
    const truth = truthOf([node(31, 0, 0), node(32, 10, 10)], [plain]);
    const host = createHostState([]);

    const frame = derivePresentation(truth, host, NONE, FLAVOR);
    expect(frame.edges[0]).toBe(plain);
  });
});

// ── SC-1 support — births flag without moving ────────────────────────────────
describe('birth derivation', () => {
  it('flags an arriving node entering at its exact truth position', () => {
    const arrival: MapChainIntent = {
      kind: 'system-appeared',
      systemId: 31,
      position: { x: 40, y: 50 },
    };
    const truth = truthOf([node(31, 40, 50)]);
    const host = consumeMerge(createHostState([]), mergeInput(truth, [arrival], 0));

    const frame = derivePresentation(truth, host, NONE, FLAVOR);
    expect(frame.nodes[0]?.position).toEqual({ x: 40, y: 50 });
    expect(frame.nodes[0]?.data.motion).toEqual({ phase: 'entering' });

    // The window expires on the scheduler's clock and the node returns to
    // plain truth by reference.
    const after = stepHost(host, PLAN.birthMs + 1, EASE, NONE, false);
    const settled = derivePresentation(truth, after.next, NONE, FLAVOR);
    expect(settled.nodes[0]).toBe(truth.nodes[0]);
  });
});

// ── Ghost lifecycle — snapshots captured from pre-merge truth ────────────────
describe('departure derivation', () => {
  const departure: MapChainIntent = { kind: 'system-departed', systemId: 31 };

  it('captures the ghost from pre-merge truth and renders it after truth drops the node', () => {
    const preMerge = truthOf([node(31, 40, 50), node(32, 0, 0)]);
    const host = consumeMerge(createHostState([]), mergeInput(preMerge, [departure], 0));

    const postMerge = truthOf([node(32, 0, 0)]);
    const frame = derivePresentation(postMerge, host, NONE, FLAVOR);
    expect(frame.nodes).toHaveLength(2);
    const ghost = frame.nodes[1];
    expect(ghost?.id).toBe('31');
    expect(ghost?.position).toEqual({ x: 40, y: 50 });
    expect(ghost?.data.motion).toEqual({ phase: 'departing', heavy: false });
    expect(ghost?.draggable).toBe(false);
    expect(ghost?.selectable).toBe(false);
    expect(ghost?.className).toBe('map-ghost');
  });

  it('drops the ghost on the scheduler clock, never a DOM event', () => {
    const preMerge = truthOf([node(31, 40, 50)]);
    const host = consumeMerge(createHostState([]), mergeInput(preMerge, [departure], 0));

    const expired = stepHost(host, PLAN.exitMs + 1, EASE, NONE, false);
    const frame = derivePresentation(truthOf([]), expired.next, NONE, FLAVOR);
    expect(frame.nodes).toHaveLength(0);
    expect(expired.next.ghostNodes.size).toBe(0);
  });

  it('never renders one id twice when a departed id re-appears mid-ghost', () => {
    const preMerge = truthOf([node(31, 40, 50)]);
    let host = consumeMerge(createHostState([]), mergeInput(preMerge, [departure], 0));

    const rearrival: MapChainIntent = {
      kind: 'system-appeared',
      systemId: 31,
      position: { x: 40, y: 50 },
    };
    const rearrivalTruth = truthOf([node(31, 40, 50)]);
    host = consumeMerge(host, mergeInput(rearrivalTruth, [rearrival], 100));

    const frame = derivePresentation(rearrivalTruth, host, NONE, FLAVOR);
    expect(frame.nodes).toHaveLength(1);
    expect(frame.nodes[0]?.data.motion).toEqual({ phase: 'entering' });
  });

  it('ghosts a departing edge from the previous-merge memory — truth has already dropped it', () => {
    // The regression this pins: ChainHost's edge memo recomputes in the merge
    // commit itself, so at adoption the departing edge is ALREADY GONE from
    // truth. Its ghost must come from the previous merge's edge memory, or
    // exits pop instead of playing their flavor.
    const treeParents = new Map([[32, 31]]);
    const before = truthOf(
      [node(31, 0, 0), node(32, 100, 0)],
      [edge('c1', 31, 32)],
      treeParents,
    );
    let host = createHostState([], before.edges);

    const collapse: readonly MapChainIntent[] = [
      { kind: 'connection-departed', connectionId: 'c1' },
      { kind: 'system-departed', systemId: 32 },
    ];
    // Post-merge truth: the edge is gone in the SAME commit; only nodes lag.
    const postMerge = truthOf([node(31, 0, 0), node(32, 100, 0)], [], treeParents);
    host = consumeMerge(host, {
      ...mergeInput(postMerge, collapse, 0),
      flavor: 'grow-from-parent',
    });

    const frame = derivePresentation(postMerge, host, NONE, 'grow-from-parent');
    const ghostEdge = frame.edges.find((candidate) => candidate.id === 'c1');
    expect(ghostEdge).toBeDefined();
    expect(ghostEdge?.data.motion).toMatchObject({
      phase: 'departing',
      flavor: 'grow',
    });

    // And it expires on the scheduler clock like every ghost.
    const expired = stepHost(host, PLAN.exitMs + 1, EASE, NONE, false);
    const after = derivePresentation(truthOf([node(31, 0, 0)]), expired.next, NONE, 'grow-from-parent');
    expect(after.edges).toHaveLength(0);
  });

  it('flags a still-in-truth departing node in the lag commit before the sync effect', () => {
    const preMerge = truthOf([node(31, 40, 50)]);
    const host = consumeMerge(createHostState([]), mergeInput(preMerge, [departure], 0));

    const frame = derivePresentation(preMerge, host, NONE, FLAVOR);
    expect(frame.nodes).toHaveLength(1);
    expect(frame.nodes[0]?.data.motion).toEqual({ phase: 'departing', heavy: false });
  });
});

// ── PD-4 — edge flavor: dash semantics never lie mid-animation ───────────────
describe('edge motion flavor', () => {
  const treeParents = new Map([[32, 31]]);

  it('always fades a dashed loop edge, whatever the dial says', () => {
    const loop = edge('c9', 31, 32, true);

    expect(
      edgeMotionFor(loop, 'entering', 'grow-from-parent', treeParents, false).flavor,
    ).toBe('fade');
  });

  it('grows a solid tree edge from its parent end under the grow dial', () => {
    const parentFirst = edgeMotionFor(
      edge('c1', 31, 32),
      'entering',
      'grow-from-parent',
      treeParents,
      false,
    );
    expect(parentFirst).toEqual({
      phase: 'entering',
      flavor: 'grow',
      reverse: false,
      heavy: false,
    });

    const childFirst = edgeMotionFor(
      edge('c2', 32, 31),
      'entering',
      'grow-from-parent',
      treeParents,
      false,
    );
    expect(childFirst.reverse).toBe(true);
  });

  it('fades everything under the fade dial', () => {
    expect(
      edgeMotionFor(edge('c1', 31, 32), 'departing', 'fade-with-child', treeParents, true),
    ).toEqual({ phase: 'departing', flavor: 'fade', reverse: false, heavy: true });
  });

  it('marks an entering edge with its motion in the derived array', () => {
    const arriving: MapChainIntent = {
      kind: 'connection-appeared',
      connectionId: 'c1',
      fromSystemId: 31,
      toSystemId: 32,
    };
    const truth = truthOf(
      [node(31, 0, 0), node(32, 10, 10)],
      [edge('c1', 31, 32)],
      treeParents,
    );
    const host = consumeMerge(createHostState([]), mergeInput(truth, [arriving], 0));

    const frame = derivePresentation(truth, host, NONE, FLAVOR);
    expect(frame.edges[0]?.data.motion?.phase).toBe('entering');
  });
});

// ── Batch discipline — the camera's identity rule, mirrored ──────────────────
describe('render adjustment', () => {
  it('consumes a batch exactly once by identity and ignores repeats', () => {
    const truth = truthOf([node(31, 0, 0)]);
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    const input = { ...mergeInput(truth, intents, 0), access: true as const };

    const adopted = adjustHostForRender(createHostState([]), input);
    expect(adopted).not.toBeNull();
    expect(adjustHostForRender(adopted as MotionHostState, input)).toBeNull();
  });

  it('treats the mount-time batch as already consumed', () => {
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    const host = createHostState(intents);

    expect(
      adjustHostForRender(host, {
        ...mergeInput(truthOf([node(31, 0, 0)]), intents, 0),
        access: true,
      }),
    ).toBeNull();
  });

  it('schedules nothing for an empty pin/release batch beyond marking it consumed', () => {
    const truth = truthOf([node(31, 0, 0)]);
    const pin: readonly MapChainIntent[] = [];
    const host = adjustHostForRender(createHostState([]), {
      ...mergeInput(truth, pin, 0),
      access: true,
    });

    expect(host).not.toBeNull();
    expect((host as MotionHostState).motion.tweens.size).toBe(0);
    expect((host as MotionHostState).displacements.size).toBe(0);
  });
});

// ── Access loss — reset, not a ghost storm ───────────────────────────────────
describe('access reset', () => {
  it('resets the whole motion state when access flips to false', () => {
    const preMerge = truthOf([node(31, 0, 0)]);
    const departure: MapChainIntent = { kind: 'system-departed', systemId: 31 };
    const busy = consumeMerge(createHostState([]), mergeInput(preMerge, [departure], 0));
    expect(busy.motion.ghosts.size).toBe(1);

    const revoked: readonly MapChainIntent[] = [departure];
    const reset = adjustHostForRender(busy, {
      ...mergeInput(truthOf([]), revoked, 10),
      access: false,
    });
    expect(reset).not.toBeNull();
    expect((reset as MotionHostState).motion.ghosts.size).toBe(0);
    expect((reset as MotionHostState).ghostNodes.size).toBe(0);

    // Idle and consumed: no further adjustment loops.
    expect(
      adjustHostForRender(reset as MotionHostState, {
        ...mergeInput(truthOf([]), revoked, 20),
        access: false,
      }),
    ).toBeNull();
  });

  it('starts clean on re-grant: the stale batch never animates', () => {
    const revoked: readonly MapChainIntent[] = [
      { kind: 'system-departed', systemId: 31 },
    ];
    const reset = createHostState(revoked);

    // Access returns with the same batch identity — nothing to consume.
    expect(
      adjustHostForRender(reset, {
        ...mergeInput(truthOf([]), revoked, 30),
        access: true,
      }),
    ).toBeNull();
  });
});

// ── DC-6 — a live reduced-motion flip completes glides instantly ─────────────
describe('reduced-motion flip', () => {
  it('resolves an in-flight glide on the next stepped frame', () => {
    const truth = truthOf([node(31, 100, 0)]);
    const intents = [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })];
    const host = consumeMerge(createHostState([]), mergeInput(truth, intents, 0));

    const flipped = stepHost(host, 50, EASE, NONE, true);
    expect(flipped.next.motion.tweens.size).toBe(0);
    expect(flipped.next.displacements.size).toBe(0);
    const frame = derivePresentation(truth, flipped.next, NONE, FLAVOR);
    expect(frame.nodes[0]).toBe(truth.nodes[0]);
  });
});

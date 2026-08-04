import { describe, expect, it } from 'vitest';
import type { MapChainIntent } from '../chain/intents';
import type { PlacedSystem } from '../chain/reconciler';
import { DEFAULT_MOTION_CONFIG } from '../motion/motion-contract';
import {
  CAMERA_FIT_MAX_ZOOM,
  IDLE_FLIGHT,
  abortFlightForDrag,
  beginFlight,
  cameraEaseOf,
  chainBounds,
  decideCameraFit,
  decideFitExecution,
  decideFocus,
  focusCenter,
  newFocusRequest,
  nodesReadyForFit,
  planCameraFit,
  resolveFitTick,
  settleFlight,
  shouldFitView,
  systemsNeedingFit,
} from './camera-follow-model';

const APPEARED: readonly MapChainIntent[] = [
  { kind: 'system-appeared', systemId: 1, position: { x: 0, y: 0 } },
];
const MOVED: readonly MapChainIntent[] = [
  { kind: 'system-moved', systemId: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
];
const DEPARTED: readonly MapChainIntent[] = [{ kind: 'system-departed', systemId: 1 }];

describe('camera fit policy', () => {
  it('frames once on the first appearance even with follow off', () => {
    expect(
      shouldFitView({ intents: APPEARED, framed: false, follow: false, dragActive: false }),
    ).toBe(true);
  });

  it('after framing, refits only while follow is on and no drag is active', () => {
    expect(
      shouldFitView({ intents: MOVED, framed: true, follow: true, dragActive: false }),
    ).toBe(true);
    expect(
      shouldFitView({ intents: MOVED, framed: true, follow: false, dragActive: false }),
    ).toBe(false);
    expect(
      shouldFitView({ intents: APPEARED, framed: true, follow: true, dragActive: true }),
    ).toBe(false);
  });

  it('never fits on merges without appearances or moves', () => {
    expect(
      shouldFitView({ intents: DEPARTED, framed: false, follow: true, dragActive: false }),
    ).toBe(false);
    expect(shouldFitView({ intents: [], framed: true, follow: true, dragActive: false })).toBe(
      false,
    );
  });

  it('waits until React Flow holds every appeared or moved system', () => {
    expect(systemsNeedingFit([...APPEARED, ...DEPARTED])).toEqual([1]);
    expect(nodesReadyForFit(APPEARED, new Set())).toBe(false);
    expect(nodesReadyForFit(APPEARED, new Set([1]))).toBe(true);
    expect(nodesReadyForFit(DEPARTED, new Set())).toBe(true);
  });

  it('decides ignore / wait / skip / fit without fitting stale nodes', () => {
    const base = {
      intents: APPEARED,
      previousIntents: DEPARTED,
      framed: false,
      follow: false,
      dragActive: false,
      nodeIds: new Set<number>(),
    };
    expect(decideCameraFit({ ...base, previousIntents: APPEARED })).toBe('ignore');
    expect(decideCameraFit(base)).toBe('wait');
    expect(decideCameraFit({ ...base, nodeIds: new Set([1]) })).toBe('fit');
    expect(
      decideCameraFit({
        ...base,
        intents: [{ kind: 'system-departed', systemId: 2 }],
        nodeIds: new Set(),
      }),
    ).toBe('skip');
    expect(planCameraFit('ignore')).toEqual({ consume: false, fit: false });
    expect(planCameraFit('wait')).toEqual({ consume: false, fit: false });
    expect(planCameraFit('skip')).toEqual({ consume: true, fit: false });
    expect(planCameraFit('fit')).toEqual({ consume: true, fit: true });
  });
});

// ── SC-5.1 · DC-5 — every camera move eases; reduced motion is the one zero ──
describe('camera easing', () => {
  const config = DEFAULT_MOTION_CONFIG;

  it('carries the slow tier and a no-overshoot ease on every plan', () => {
    const { duration, ease } = cameraEaseOf(config, false);

    expect(duration).toBe(config.tempo.slow);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    // No overshoot: a pan past the target reads as a lunge.
    for (let i = 0; i <= 100; i += 1) {
      expect(ease(i / 100)).toBeLessThanOrEqual(1);
    }
  });

  it('zeroes duration only under reduced motion', () => {
    expect(cameraEaseOf(config, true).duration).toBe(0);
    expect(cameraEaseOf(config, false).duration).toBeGreaterThan(0);
  });
});

// ── SC-5.1 — bounds come from reconciled targets, padded for disc and label ──
describe('chain bounds', () => {
  const placed = (systemId: number, x: number, y: number): [number, PlacedSystem] => [
    systemId,
    { systemId, position: { x, y }, placementSource: 'assigner' },
  ];

  it('is null for an empty chain — nothing to frame', () => {
    expect(chainBounds(new Map(), 22)).toBeNull();
  });

  it('spans the reconciled positions plus disc diameter and label allowance', () => {
    const systems = new Map([placed(1, 0, 0), placed(2, 300, -150)]);

    expect(chainBounds(systems, 22)).toEqual({
      x: 0,
      y: -150,
      width: 300 + 44,
      height: 150 + 44 + 24,
    });
  });

  it('caps fit zoom so a lone home system does not fill the viewport', () => {
    // fitBounds ignores option maxZoom and uses the store ceiling (2.5); the
    // hook must feed this constant into getViewportForBounds instead.
    expect(CAMERA_FIT_MAX_ZOOM).toBe(0.75);
    expect(CAMERA_FIT_MAX_ZOOM).toBeLessThan(2.5);
  });
});

// ── SC-5.1 — focus at the preserved zoom, only when allowed ──────────────────
describe('focus decision', () => {
  const center = { x: 10, y: 20 };

  it('centers at exactly the current zoom when enabled and undragged', () => {
    expect(decideFocus({ enabled: true, dragActive: false, center, zoom: 0.7 })).toEqual({
      x: 10,
      y: 20,
      zoom: 0.7,
    });
  });

  it('does nothing when the setting is off, a drag is live, or the node is gone', () => {
    expect(decideFocus({ enabled: false, dragActive: false, center, zoom: 1 })).toBeNull();
    expect(decideFocus({ enabled: true, dragActive: true, center, zoom: 1 })).toBeNull();
    expect(decideFocus({ enabled: true, dragActive: false, center: null, zoom: 1 })).toBeNull();
  });
});

// ── SC-5.1 — drag-start abort and newer-supersedes-older ─────────────────────
describe('camera flight lifecycle', () => {
  it('begins active and settles only for its own generation', () => {
    const first = beginFlight(IDLE_FLIGHT);
    expect(first.active).toBe(true);

    // A newer flight supersedes; the older completion must change nothing.
    const second = beginFlight(first);
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(settleFlight(second, first.generation)).toBe(second);
    expect(settleFlight(second, second.generation).active).toBe(false);
  });

  it('aborts an in-flight transition on drag start and ignores idle drags', () => {
    const flight = beginFlight(IDLE_FLIGHT);
    const aborted = abortFlightForDrag(flight);

    expect(aborted.active).toBe(false);
    // The bumped generation orphans the aborted transition's completion.
    expect(settleFlight(aborted, flight.generation)).toBe(aborted);
    expect(abortFlightForDrag(IDLE_FLIGHT)).toBe(IDLE_FLIGHT);
  });
});

// ── Fallow-driven extraction — the hook executes these decisions verbatim ────
describe('fit execution', () => {
  const systems = new Map([
    [1, { systemId: 1, position: { x: 0, y: 0 }, placementSource: 'assigner' } as PlacedSystem],
  ]);

  it('returns bounds only when the policy warrants a fit', () => {
    const warranted = decideFitExecution({
      intents: APPEARED,
      previousIntents: [],
      framed: false,
      follow: false,
      dragActive: false,
      nodeIds: new Set([1]),
      systems,
      discRadius: 22,
    });
    expect(warranted.consume).toBe(true);
    expect(warranted.bounds).toEqual({ x: 0, y: 0, width: 44, height: 44 + 24 });
  });

  it('consumes without bounds when the batch warrants no fit', () => {
    const skipped = decideFitExecution({
      intents: DEPARTED,
      previousIntents: [],
      framed: true,
      follow: true,
      dragActive: false,
      nodeIds: new Set([1]),
      systems,
      discRadius: 22,
    });
    expect(skipped.consume).toBe(true);
    expect(skipped.bounds).toBeNull();
  });

  it('waits (no consume, no bounds) while nodes are not ready', () => {
    const waiting = decideFitExecution({
      intents: APPEARED,
      previousIntents: [],
      framed: false,
      follow: false,
      dragActive: false,
      nodeIds: new Set(),
      systems,
      discRadius: 22,
    });
    expect(waiting.consume).toBe(false);
    expect(waiting.bounds).toBeNull();
  });

  it('skips the whole tick until the viewport is ready', () => {
    const skipped = resolveFitTick({
      viewportReady: false,
      intents: APPEARED,
      previousIntents: [],
      framed: false,
      follow: false,
      dragActive: false,
      nodeIds: new Set([1]),
      systems,
      discRadius: 22,
    });
    expect(skipped).toEqual({ consume: false, bounds: null, framed: false });
  });

  it('marks framed once a ready viewport warrants a fit', () => {
    const tick = resolveFitTick({
      viewportReady: true,
      intents: APPEARED,
      previousIntents: [],
      framed: false,
      follow: false,
      dragActive: false,
      nodeIds: new Set([1]),
      systems,
      discRadius: 22,
    });
    expect(tick.consume).toBe(true);
    expect(tick.bounds).not.toBeNull();
    expect(tick.framed).toBe(true);
  });
});

describe('focus request gating', () => {
  const request = { nodeId: '31', token: 3 };

  it('answers a fresh request exactly once', () => {
    expect(newFocusRequest(request, 2, true)).toBe(request);
    expect(newFocusRequest(request, 3, true)).toBeNull();
  });

  it('answers nothing before the viewport exists or without a click', () => {
    expect(newFocusRequest(request, 2, false)).toBeNull();
    expect(newFocusRequest(null, 2, true)).toBeNull();
  });
});

describe('focus center', () => {
  it('centers the disc atop the node column', () => {
    expect(focusCenter({ x: 100, y: 200, width: 80 }, 22)).toEqual({ x: 140, y: 222 });
  });

  it('falls back to the disc diameter when the node is unmeasured', () => {
    expect(focusCenter({ x: 100, y: 200 }, 22)).toEqual({ x: 122, y: 222 });
  });

  it('is null for a vanished node', () => {
    expect(focusCenter(null, 22)).toBeNull();
  });
});

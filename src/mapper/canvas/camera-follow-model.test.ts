import { expect, test } from 'vitest';
import type { MapChainIntent } from '../chain/intents';
import type { PlacedSystem } from '../chain/reconciler';
import { DEFAULT_MOTION_CONFIG } from '../motion/motion-contract';
import { SYSTEM_FRAME_HEIGHT, SYSTEM_FRAME_WIDTH } from './SystemNode';
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

const FRAME = { width: SYSTEM_FRAME_WIDTH, height: SYSTEM_FRAME_HEIGHT };
const DEPARTED: readonly MapChainIntent[] = [{ kind: 'system-departed', systemId: 1 }];

const placed = (systemId: number, x: number, y: number): [number, PlacedSystem] => [
  systemId,
  { systemId, position: { x, y }, placementSource: 'assigner' },
];

test('camera fit policy frames first appearance, then only follow-on moves when ready', () => {
  expect(
    shouldFitView({ intents: APPEARED, framed: false, follow: false, dragActive: false }),
  ).toBe(true);
  expect(
    shouldFitView({ intents: MOVED, framed: true, follow: true, dragActive: false }),
  ).toBe(true);
  expect(
    shouldFitView({ intents: MOVED, framed: true, follow: false, dragActive: false }),
  ).toBe(false);
  expect(
    shouldFitView({ intents: APPEARED, framed: true, follow: true, dragActive: true }),
  ).toBe(false);
  expect(
    shouldFitView({ intents: DEPARTED, framed: false, follow: true, dragActive: false }),
  ).toBe(false);
  expect(shouldFitView({ intents: [], framed: true, follow: true, dragActive: false })).toBe(
    false,
  );

  expect(systemsNeedingFit([...APPEARED, ...DEPARTED])).toEqual([1]);
  expect(nodesReadyForFit(APPEARED, new Set())).toBe(false);
  expect(nodesReadyForFit(APPEARED, new Set([1]))).toBe(true);
  expect(nodesReadyForFit(DEPARTED, new Set())).toBe(true);

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

test('fit execution returns bounds, waits, skips, and marks framed across one tick journey', () => {
  const systems = new Map([
    [1, { systemId: 1, position: { x: 0, y: 0 }, placementSource: 'assigner' } as PlacedSystem],
  ]);

  const warranted = decideFitExecution({
    intents: APPEARED,
    previousIntents: [],
    framed: false,
    follow: false,
    dragActive: false,
    nodeIds: new Set([1]),
    systems,
    frame: FRAME,
  });
  expect(warranted.consume).toBe(true);
  expect(warranted.bounds).toEqual({
    x: 0,
    y: 0,
    width: SYSTEM_FRAME_WIDTH,
    height: SYSTEM_FRAME_HEIGHT,
  });

  const skipped = decideFitExecution({
    intents: DEPARTED,
    previousIntents: [],
    framed: true,
    follow: true,
    dragActive: false,
    nodeIds: new Set([1]),
    systems,
    frame: FRAME,
  });
  expect(skipped.consume).toBe(true);
  expect(skipped.bounds).toBeNull();

  const waiting = decideFitExecution({
    intents: APPEARED,
    previousIntents: [],
    framed: false,
    follow: false,
    dragActive: false,
    nodeIds: new Set(),
    systems,
    frame: FRAME,
  });
  expect(waiting.consume).toBe(false);
  expect(waiting.bounds).toBeNull();

  expect(
    resolveFitTick({
      viewportReady: false,
      intents: APPEARED,
      previousIntents: [],
      framed: false,
      follow: false,
      dragActive: false,
      nodeIds: new Set([1]),
      systems,
      frame: FRAME,
    }),
  ).toEqual({ consume: false, bounds: null, framed: false });

  const tick = resolveFitTick({
    viewportReady: true,
    intents: APPEARED,
    previousIntents: [],
    framed: false,
    follow: false,
    dragActive: false,
    nodeIds: new Set([1]),
    systems,
    frame: FRAME,
  });
  expect(tick.consume).toBe(true);
  expect(tick.bounds).not.toBeNull();
  expect(tick.framed).toBe(true);
});

test('focus gating centers measured or declared frames only when allowed', () => {
  const center = { x: 10, y: 20 };
  expect(decideFocus({ enabled: true, dragActive: false, center, zoom: 0.7 })).toEqual({
    x: 10,
    y: 20,
    zoom: 0.7,
  });
  expect(decideFocus({ enabled: false, dragActive: false, center, zoom: 1 })).toBeNull();
  expect(decideFocus({ enabled: true, dragActive: true, center, zoom: 1 })).toBeNull();
  expect(decideFocus({ enabled: true, dragActive: false, center: null, zoom: 1 })).toBeNull();

  const request = { nodeId: '31', token: 3 };
  expect(newFocusRequest(request, 2, true)).toBe(request);
  expect(newFocusRequest(request, 3, true)).toBeNull();
  expect(newFocusRequest(request, 2, false)).toBeNull();
  expect(newFocusRequest(null, 2, true)).toBeNull();

  expect(focusCenter({ x: 100, y: 200, width: 80, height: 60 }, FRAME)).toEqual({
    x: 140,
    y: 230,
  });
  expect(focusCenter({ x: 100, y: 200 }, FRAME)).toEqual({
    x: 100 + SYSTEM_FRAME_WIDTH / 2,
    y: 200 + SYSTEM_FRAME_HEIGHT / 2,
  });
  expect(focusCenter(null, FRAME)).toBeNull();
});

test('camera easing, chain bounds, and flight lifecycle keep product pins', () => {
  const config = DEFAULT_MOTION_CONFIG;
  const { duration, ease } = cameraEaseOf(config, false);
  expect(duration).toBe(config.tempo.slow);
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  for (let i = 0; i <= 100; i += 1) {
    expect(ease(i / 100)).toBeLessThanOrEqual(1);
  }
  expect(cameraEaseOf(config, true).duration).toBe(0);
  expect(cameraEaseOf(config, false).duration).toBeGreaterThan(0);

  expect(chainBounds(new Map(), FRAME)).toBeNull();
  expect(chainBounds(new Map([placed(1, 0, 0), placed(2, 300, -150)]), FRAME)).toEqual({
    x: 0,
    y: -150,
    width: 300 + SYSTEM_FRAME_WIDTH,
    height: 150 + SYSTEM_FRAME_HEIGHT,
  });
  expect(CAMERA_FIT_MAX_ZOOM).toBeLessThan(2.5);

  const first = beginFlight(IDLE_FLIGHT);
  expect(first.active).toBe(true);
  const second = beginFlight(first);
  expect(second.generation).toBeGreaterThan(first.generation);
  expect(settleFlight(second, first.generation)).toBe(second);
  expect(settleFlight(second, second.generation).active).toBe(false);

  const flight = beginFlight(IDLE_FLIGHT);
  const aborted = abortFlightForDrag(flight);
  expect(aborted.active).toBe(false);
  expect(settleFlight(aborted, flight.generation)).toBe(aborted);
  expect(abortFlightForDrag(IDLE_FLIGHT)).toBe(IDLE_FLIGHT);
});

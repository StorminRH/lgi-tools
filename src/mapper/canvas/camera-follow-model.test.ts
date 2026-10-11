import { expect, test } from 'vitest';
import type { MapChainIntent } from '../chain/intents';
import type { PlacedSystem } from '../chain/reconciler';
import { DEFAULT_MOTION_CONFIG } from '../motion/motion-contract';
import { SYSTEM_FRAME_HEIGHT, SYSTEM_FRAME_WIDTH } from './disc-chrome';
import {
  CAMERA_FIT_MAX_ZOOM,
  cameraEaseOf,
  chainBounds,
  decideFocus,
  focusCenter,
  newFocusRequest,
  resolveFitTick,
  type FitInput,
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
  { systemId, position: { x, y } },
];

test('a fit tick ignores, waits, skips, or fits, and only a real fit marks the chain framed', () => {
  const systems = new Map([placed(1, 0, 0)]);
  const tick = (input: Partial<FitInput>) =>
    resolveFitTick({
      viewportReady: true,
      intents: APPEARED,
      previousIntents: [],
      framed: false,
      follow: false,
      nodeIds: new Set([1]),
      systems,
      frame: FRAME,
      ...input,
    });
  const FIT = {
    consume: true,
    bounds: { x: 0, y: 0, width: SYSTEM_FRAME_WIDTH, height: SYSTEM_FRAME_HEIGHT },
    framed: true,
  };

  // An unready viewport never consumes, so the same intents fit once it is ready.
  expect(tick({ viewportReady: false })).toStrictEqual({ consume: false, bounds: null, framed: false });
  expect(tick({ viewportReady: false, framed: true })).toStrictEqual({ consume: false, bounds: null, framed: true });
  // Intents already handled are ignored without consuming.
  expect(tick({ previousIntents: APPEARED })).toStrictEqual({ consume: false, bounds: null, framed: false });

  // Until the chain is framed any appearance or move fits; once framed, only while following.
  expect(tick({})).toStrictEqual(FIT);
  expect(tick({ intents: MOVED })).toStrictEqual(FIT);
  expect(tick({ intents: MOVED, framed: true, follow: true })).toStrictEqual(FIT);
  expect(tick({ intents: APPEARED, framed: true, follow: true })).toStrictEqual(FIT);

  // Nothing appeared or moved, or framed with follow off: consume, no fit.
  expect(tick({ intents: DEPARTED })).toStrictEqual({ consume: true, bounds: null, framed: false });
  expect(tick({ intents: [], framed: true, follow: true })).toStrictEqual({ consume: true, bounds: null, framed: true });
  expect(tick({ intents: MOVED, framed: true, follow: false })).toStrictEqual({ consume: true, bounds: null, framed: true });
  expect(tick({ intents: DEPARTED, nodeIds: new Set() })).toStrictEqual({ consume: true, bounds: null, framed: false });

  // A system to frame without a mounted node waits, unconsumed, for the next tick.
  expect(tick({ nodeIds: new Set() })).toStrictEqual({ consume: false, bounds: null, framed: false });
  const twoAppeared: readonly MapChainIntent[] = [
    ...APPEARED,
    { kind: 'system-appeared', systemId: 2, position: { x: 0, y: 0 } },
  ];
  expect(tick({ intents: twoAppeared })).toStrictEqual({ consume: false, bounds: null, framed: false });
  // Departures never hold a fit back, even for a system with no node.
  expect(
    tick({ intents: [...APPEARED, { kind: 'system-departed', systemId: 2 }] }),
  ).toStrictEqual(FIT);

  // An empty chain consumes the fit but has no bounds, so framed stays as it was.
  expect(tick({ systems: new Map() })).toStrictEqual({ consume: true, bounds: null, framed: false });
});

test('focus gating centers measured or declared frames only when allowed', () => {
  const center = { x: 10, y: 20 };
  expect(decideFocus({ enabled: true, center, zoom: 0.7 })).toEqual({
    x: 10,
    y: 20,
    zoom: 0.7,
  });
  expect(decideFocus({ enabled: false, center, zoom: 1 })).toBeNull();
  expect(decideFocus({ enabled: true, center: null, zoom: 1 })).toBeNull();

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

test('camera easing and chain bounds keep product pins', () => {
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
});

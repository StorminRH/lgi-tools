import { expect, test } from 'vitest';
import {
  chainLinkFogPath,
  chainLinkPath,
  endpointFrame,
  frameCenter,
  frameSegment,
  pointAlongChainLink,
  type FrameRect,
} from './edge-geometry';

const frame = (x: number, y: number, width = 120, height = 88): FrameRect => ({
  x,
  y,
  width,
  height,
});

const node = (
  x: number,
  y: number,
  dims: {
    readonly measured?: { readonly width?: number; readonly height?: number };
    readonly width?: number;
    readonly height?: number;
  } = {},
) => ({
  internals: { positionAbsolute: { x, y } },
  measured: dims.measured ?? {},
  width: dims.width,
  height: dims.height,
});

const MEASURED = { measured: { width: 120, height: 88 } };

test('frameSegment clips H/V/diagonal segments and nulls touching frames', () => {
  // Centers (60, 44) and (360, 44); each frame claims 60px of the 300px run.
  expect(frameSegment(frame(0, 0), frame(300, 0))).toEqual({
    startX: 120,
    startY: 44,
    endX: 300,
    endY: 44,
  });
  // Centers (60, 44) and (60, 244); each frame claims 44px of the 200px run.
  expect(frameSegment(frame(0, 0), frame(0, 200))).toEqual({
    startX: 60,
    startY: 88,
    endX: 60,
    endY: 200,
  });
  // 100×100 frames, centers (50, 50) → (250, 150): dx dominates.
  expect(frameSegment(frame(0, 0, 100, 100), frame(200, 100, 100, 100))).toEqual({
    startX: 100,
    startY: 75,
    endX: 200,
    endY: 125,
  });
  // Source 120×88, target 40×40: centers (60, 44) → (320, 44).
  expect(frameSegment(frame(0, 0), frame(300, 24, 40, 40))).toEqual({
    startX: 120,
    startY: 44,
    endX: 300,
    endY: 44,
  });
  expect(frameSegment(frame(0, 0), frame(100, 0))).toBeNull();
  expect(frameSegment(frame(0, 0), frame(30, 10))).toBeNull();
  expect(frameSegment(frame(0, 0), frame(0, 0))).toBeNull();
  expect(frameCenter(frame(10, 20))).toEqual({ x: 70, y: 64 });
});

test('chainLinkPath prefers measured frames and nulls incomplete endpoints', () => {
  expect(chainLinkPath(node(0, 0, MEASURED), node(300, 0, MEASURED))).toBe('M 120,44 L 300,44');

  const declared = { width: 120, height: 88 };
  expect(chainLinkPath(node(0, 0, declared), node(300, 0, declared))).toBe('M 120,44 L 300,44');

  const both = { measured: { width: 40, height: 40 }, width: 120, height: 88 };
  expect(endpointFrame(node(0, 0, both))).toEqual({ x: 0, y: 0, width: 40, height: 40 });

  expect(chainLinkPath(undefined, node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), undefined)).toBeNull();
  expect(chainLinkPath(node(0, 0), node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), node(300, 0))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), node(100, 0, MEASURED))).toBeNull();
});

test('pointAlongChainLink walks the clipped segment with CSS heading', () => {
  const source = frame(0, 0);
  const target = frame(300, 0);
  expect(pointAlongChainLink(source, target, 0)).toEqual({ x: 120, y: 44, angle: 0 });
  expect(pointAlongChainLink(source, target, 1)).toEqual({ x: 300, y: 44, angle: 0 });
  expect(pointAlongChainLink(source, target, 0.5)).toEqual({ x: 210, y: 44, angle: 0 });
  expect(pointAlongChainLink(frame(0, 0), frame(0, 200), 0.5)?.angle).toBe(90);
  expect(pointAlongChainLink(frame(0, 200), frame(0, 0), 0.5)?.angle).toBe(-90);
  expect(pointAlongChainLink(frame(300, 0), frame(0, 0), 0.5)?.angle).toBe(180);
  expect(pointAlongChainLink(frame(0, 0), frame(100, 0), 0.5)).toBeNull();
});

test('chainLinkFogPath keeps the drawn-side stub and nulls like the full path', () => {
  const measured = (x: number, y: number) => ({
    internals: { positionAbsolute: { x, y } },
    measured: { width: 120, height: 88 },
  });
  // Full clipped segment runs x 120 → 300; half the cut keeps 120 → 210.
  expect(chainLinkFogPath(measured(0, 0), measured(300, 0), 'target', 0.5)).toBe(
    'M 120,44 L 210,44',
  );
  expect(chainLinkFogPath(measured(0, 0), measured(300, 0), 'source', 0.5)).toBe(
    'M 210,44 L 300,44',
  );
  expect(chainLinkFogPath(undefined, measured(300, 0), 'target', 0.5)).toBeNull();
  expect(chainLinkFogPath(measured(0, 0), measured(100, 0), 'target', 0.5)).toBeNull();
});

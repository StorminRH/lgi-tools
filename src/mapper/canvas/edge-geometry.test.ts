import { expect, test } from 'vitest';
import {
  SYSTEM_DISC_SIZE,
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
} from './SystemNode';
import {
  chainLinkFogPath,
  chainLinkPath,
  endpointFrame,
  frameCenter,
  frameSegment,
  pointAlongChainLink,
  pointOnRayAtRadius,
  type FrameRect,
} from './edge-geometry';

const FRAME_W = SYSTEM_FRAME_WIDTH;
const FRAME_H = SYSTEM_FRAME_HEIGHT;
const DISC_R = SYSTEM_DISC_SIZE / 2;
const CX = FRAME_W / 2;
const CY = FRAME_H / 2;

const frame = (x: number, y: number, width = FRAME_W, height = FRAME_H): FrameRect => ({
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

const MEASURED = { measured: { width: FRAME_W, height: FRAME_H } };

test('frameSegment clips H/V/diagonal segments to the disc rim and nulls touching discs', () => {
  expect(frameSegment(frame(0, 0), frame(300, 0))).toEqual({
    startX: CX + DISC_R,
    startY: CY,
    endX: 300 + CX - DISC_R,
    endY: CY,
  });
  expect(frameSegment(frame(0, 0), frame(0, 200))).toEqual({
    startX: CX,
    startY: CY + DISC_R,
    endX: CX,
    endY: 200 + CY - DISC_R,
  });
  expect(frameSegment(frame(0, 0), frame(80, 60))).toEqual({
    startX: CX + 80 * (DISC_R / 100),
    startY: CY + 60 * (DISC_R / 100),
    endX: CX + 80 * (1 - DISC_R / 100),
    endY: CY + 60 * (1 - DISC_R / 100),
  });
  expect(frameSegment(frame(0, 0), frame(DISC_R * 2, 0))).toBeNull();
  expect(frameSegment(frame(0, 0), frame(30, 10))).toBeNull();
  expect(frameSegment(frame(0, 0), frame(0, 0))).toBeNull();
  expect(frameCenter(frame(10, 20))).toEqual({ x: 10 + CX, y: 20 + CY });
  expect(pointOnRayAtRadius({ x: 0, y: 0 }, { x: 80, y: 60 }, DISC_R)).toEqual({
    x: 80 * (DISC_R / 100),
    y: 60 * (DISC_R / 100),
  });
  expect(pointOnRayAtRadius({ x: 0, y: 0 }, { x: 0, y: 0 }, DISC_R)).toBeNull();
});

test('chainLinkPath prefers measured frames and nulls incomplete endpoints', () => {
  expect(chainLinkPath(node(0, 0, MEASURED), node(300, 0, MEASURED))).toBe(
    `M ${CX + DISC_R},${CY} L ${300 + CX - DISC_R},${CY}`,
  );

  const declared = { width: FRAME_W, height: FRAME_H };
  expect(chainLinkPath(node(0, 0, declared), node(300, 0, declared))).toBe(
    `M ${CX + DISC_R},${CY} L ${300 + CX - DISC_R},${CY}`,
  );

  const both = { measured: { width: 40, height: 40 }, width: FRAME_W, height: FRAME_H };
  expect(endpointFrame(node(0, 0, both))).toEqual({ x: 0, y: 0, width: 40, height: 40 });

  expect(chainLinkPath(undefined, node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), undefined)).toBeNull();
  expect(chainLinkPath(node(0, 0), node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), node(300, 0))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), node(DISC_R * 2, 0, MEASURED))).toBeNull();
});

test('pointAlongChainLink walks the clipped segment with CSS heading', () => {
  const source = frame(0, 0);
  const target = frame(300, 0);
  expect(pointAlongChainLink(source, target, 0)).toEqual({
    x: CX + DISC_R,
    y: CY,
    angle: 0,
  });
  expect(pointAlongChainLink(source, target, 1)).toEqual({
    x: 300 + CX - DISC_R,
    y: CY,
    angle: 0,
  });
  expect(pointAlongChainLink(source, target, 0.5)).toEqual({
    x: 300 / 2 + CX,
    y: CY,
    angle: 0,
  });
  expect(pointAlongChainLink(frame(0, 0), frame(0, 200), 0.5)?.angle).toBe(90);
  expect(pointAlongChainLink(frame(0, 200), frame(0, 0), 0.5)?.angle).toBe(-90);
  expect(pointAlongChainLink(frame(300, 0), frame(0, 0), 0.5)?.angle).toBe(180);
  expect(pointAlongChainLink(frame(0, 0), frame(DISC_R * 2, 0), 0.5)).toBeNull();
});

test('chainLinkFogPath keeps the drawn-side stub and nulls like the full path', () => {
  const measured = (x: number, y: number) => ({
    internals: { positionAbsolute: { x, y } },
    measured: { width: FRAME_W, height: FRAME_H },
  });
  const startX = CX + DISC_R;
  const endX = 300 + CX - DISC_R;
  const midX = (startX + endX) / 2;
  expect(chainLinkFogPath(measured(0, 0), measured(300, 0), 'target', 0.5)).toBe(
    `M ${startX},${CY} L ${midX},${CY}`,
  );
  expect(chainLinkFogPath(measured(0, 0), measured(300, 0), 'source', 0.5)).toBe(
    `M ${midX},${CY} L ${endX},${CY}`,
  );
  expect(chainLinkFogPath(undefined, measured(300, 0), 'target', 0.5)).toBeNull();
  expect(chainLinkFogPath(measured(0, 0), measured(DISC_R * 2, 0), 'target', 0.5)).toBeNull();
});

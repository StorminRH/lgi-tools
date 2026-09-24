import { expect, test } from 'vitest';
import { ICON_TRACK_CLEARANCE_PX } from './disc-chrome';
import {
  SYSTEM_DISC_SIZE,
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
} from './SystemNode';
import {
  EDGE_TAPER_PX,
  chainLinkFogPath,
  chainLinkPath,
  connectionLabelBox,
  edgeTaperFraction,
  endpointFrame,
  frameCenter,
  frameNameBox,
  frameSegment,
  kspaceCaptionBox,
  pointAlongChainLink,
  pointOnRayAtRadius,
  type FrameRect,
} from './edge-geometry';

const FRAME_W = SYSTEM_FRAME_WIDTH;
const FRAME_H = SYSTEM_FRAME_HEIGHT;
const DISC_R = SYSTEM_DISC_SIZE / 2;
const CLEAR = ICON_TRACK_CLEARANCE_PX;
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

test('frameSegment stops at the icon ring and nulls lines that would cross it', () => {
  expect(frameSegment(frame(0, 0), frame(300, 0))).toEqual({
    startX: CX + CLEAR,
    startY: CY,
    endX: 300 + CX - CLEAR,
    endY: CY,
  });
  expect(frameSegment(frame(0, 0), frame(0, 200))).toEqual({
    startX: CX,
    startY: CY + CLEAR,
    endX: CX,
    endY: 200 + CY - CLEAR,
  });
  const diagonal = frameSegment(frame(0, 0), frame(80, 60));
  expect(diagonal?.startX).toBeCloseTo(CX + 80 * (CLEAR / 100));
  expect(diagonal?.startY).toBeCloseTo(CY + 60 * (CLEAR / 100));
  expect(diagonal?.endX).toBeCloseTo(CX + 80 * (1 - CLEAR / 100));
  expect(diagonal?.endY).toBeCloseTo(CY + 60 * (1 - CLEAR / 100));
  expect(frameSegment(frame(0, 0), frame(DISC_R * 2, 0))).toBeNull();
  expect(frameSegment(frame(0, 0), frame(CLEAR * 2, 0))).toBeNull();
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
    `M ${CX + CLEAR},${CY} L ${300 + CX - CLEAR},${CY}`,
  );

  const declared = { width: FRAME_W, height: FRAME_H };
  expect(chainLinkPath(node(0, 0, declared), node(300, 0, declared))).toBe(
    `M ${CX + CLEAR},${CY} L ${300 + CX - CLEAR},${CY}`,
  );

  const both = { measured: { width: 40, height: 40 }, width: FRAME_W, height: FRAME_H };
  expect(endpointFrame(node(0, 0, both))).toEqual({ x: 0, y: 0, width: 40, height: 40 });

  expect(chainLinkPath(undefined, node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), undefined)).toBeNull();
  expect(chainLinkPath(node(0, 0), node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), node(300, 0))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), node(DISC_R * 2, 0, MEASURED))).toBeNull();
  expect(chainLinkPath(node(0, 0, MEASURED), node(CLEAR * 2, 0, MEASURED))).toBeNull();
});

test('pointAlongChainLink walks the clipped segment with CSS heading', () => {
  const source = frame(0, 0);
  const target = frame(300, 0);
  expect(pointAlongChainLink(source, target, 0)).toEqual({
    x: CX + CLEAR,
    y: CY,
    angle: 0,
  });
  expect(pointAlongChainLink(source, target, 1)).toEqual({
    x: 300 + CX - CLEAR,
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
  const startX = CX + CLEAR;
  const endX = 300 + CX - CLEAR;
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

test('k-space captions push an arriving line out past the text', () => {
  const caption = kspaceCaptionBox();
  const source = frame(0, 0);
  const target = frame(0, 200);
  const from = frameCenter(source);
  const to = frameCenter(target);
  expect(frameSegment(source, target, { source: caption, target: caption })).toEqual({
    startX: from.x,
    startY: from.y + CLEAR,
    endX: to.x,
    endY: to.y + caption.top,
  });
  expect(caption.top).toBe(-71.5);
});

test('wormhole names and derived nodes use the frame label, k-space uses the caption', () => {
  expect(connectionLabelBox(undefined)).toBeNull();
  expect(connectionLabelBox({ security: 1 })).toEqual(kspaceCaptionBox());
  expect(connectionLabelBox({ whClassId: 2 })).toEqual(frameNameBox());
  expect(connectionLabelBox({ security: 1, halo: { ring: 1 } })).toEqual(frameNameBox());
  expect(connectionLabelBox({ stub: { code: 'B274' } })).toEqual(frameNameBox());
  expect(frameNameBox().top).toBe(4 - FRAME_H / 2);
});

test('edge taper is a fixed run that collapses on a short segment', () => {
  const span = frameSegment(frame(0, 0), frame(300, 0));
  expect(span).not.toBeNull();
  if (span === null) return;
  expect(edgeTaperFraction(span)).toBe(EDGE_TAPER_PX / (300 - CLEAR * 2));
  const cramped = frameSegment(frame(0, 0), frame(CLEAR * 2 + 10, 0));
  expect(cramped).not.toBeNull();
  if (cramped === null) return;
  expect(edgeTaperFraction(cramped)).toBe(0.5);
});

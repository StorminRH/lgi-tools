import { expect, test } from 'vitest';
import { ICON_TRACK_CLEARANCE_PX } from './disc-chrome';
import {
  SYSTEM_DISC_SIZE,
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
} from './SystemNode';
import {
  chainLinkSegment,
  chainLinkPath,
  connectionLabelBox,
  edgeTaperFraction,
  endpointFrame,
  frameCenter,
  frameNameBox,
  frameSegment,
  kspaceCaptionBox,
  pointAlongSegment,
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

test('chainLinkSegment prefers measured frames and nulls incomplete endpoints', () => {
  expect(chainLinkSegment(node(0, 0, MEASURED), node(300, 0, MEASURED))).toEqual({
    startX: 120.5, startY: 55, endX: 329.5, endY: 55,
  });
  const declared = { width: FRAME_W, height: FRAME_H };
  expect(chainLinkSegment(node(0, 0, declared), node(300, 0, declared))).toEqual({
    startX: 120.5, startY: 55, endX: 329.5, endY: 55,
  });
  const both = { measured: { width: 40, height: 40 }, width: FRAME_W, height: FRAME_H };
  expect(endpointFrame(node(0, 0, both))).toEqual({ x: 0, y: 0, width: 40, height: 40 });
  expect(chainLinkSegment(node(0, 0, both), node(300, 0, both))).toEqual({
    startX: 65.5, startY: 20, endX: 274.5, endY: 20,
  });
  expect(chainLinkSegment(undefined, node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkSegment(node(0, 0, MEASURED), undefined)).toBeNull();
  expect(chainLinkSegment(node(0, 0), node(300, 0, MEASURED))).toBeNull();
  expect(chainLinkSegment(node(0, 0, MEASURED), node(300, 0))).toBeNull();
  expect(chainLinkSegment(node(0, 0, MEASURED), node(DISC_R * 2, 0, MEASURED))).toBeNull();
  expect(chainLinkSegment(node(0, 0, MEASURED), node(CLEAR * 2, 0, MEASURED))).toBeNull();
});

test('chainLinkPath cuts only the fog side of the shared segment', () => {
  const segment = { startX: 0, startY: 0, endX: 100, endY: 0 };
  expect(chainLinkPath(segment, undefined, 0.25)).toBe('M 0,0 L 100,0');
  expect(chainLinkPath(segment, 'target', 0.25)).toBe('M 0,0 L 25,0');
  expect(chainLinkPath(segment, 'source', 0.25)).toBe('M 75,0 L 100,0');
});

test('pointAlongSegment walks in either direction with CSS heading', () => {
  const segment = { startX: 0, startY: 0, endX: 100, endY: 0 };
  expect(pointAlongSegment(segment, 0, true)).toEqual({ x: 0, y: 0, angle: 0 });
  expect(pointAlongSegment(segment, 1, true)).toEqual({ x: 100, y: 0, angle: 0 });
  expect(pointAlongSegment(segment, 0.7, true)).toEqual({ x: 70, y: 0, angle: 0 });
  expect(pointAlongSegment(segment, 0.7, false)).toEqual({ x: 30, y: 0, angle: 180 });
  const vertical = { startX: 0, startY: 0, endX: 0, endY: 100 };
  expect(pointAlongSegment(vertical, 0.7, true)).toEqual({ x: 0, y: 70, angle: 90 });
  expect(pointAlongSegment(vertical, 0.7, false)).toEqual({ x: 0, y: 30, angle: -90 });
  const diagonal = { startX: 0, startY: 0, endX: 100, endY: 100 };
  expect(pointAlongSegment(diagonal, 0.7, true)).toEqual({ x: 70, y: 70, angle: 45 });
  expect(pointAlongSegment(diagonal, 0.7, false)).toEqual({ x: 30, y: 30, angle: -135 });
});

test('asymmetric captions remain attached to their endpoint for paths and reversed arrows', () => {
  const segment = chainLinkSegment(
    { ...node(0, 0, MEASURED), data: { whClassId: 2 } },
    { ...node(0, 200, MEASURED), data: { security: 1 } },
  );
  expect(segment).toEqual({ startX: 75, startY: 100.5, endX: 75, endY: 183.5 });
  if (segment === null) throw new Error('Expected separated endpoints to render');
  expect(chainLinkPath(segment, undefined, 0.25)).toBe('M 75,100.5 L 75,183.5');
  expect(chainLinkPath(segment, 'target', 0.25)).toBe('M 75,100.5 L 75,121.25');
  expect(chainLinkPath(segment, 'source', 0.25)).toBe('M 75,162.75 L 75,183.5');
  expect(pointAlongSegment(segment, 0.25, true)).toEqual({ x: 75, y: 121.25, angle: 90 });
  expect(pointAlongSegment(segment, 0.25, false)).toEqual({ x: 75, y: 162.75, angle: -90 });
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
  expect(edgeTaperFraction({ startX: 0, startY: 0, endX: 100, endY: 0 })).toBe(0.24);
  expect(edgeTaperFraction({ startX: 0, startY: 0, endX: 20, endY: 0 })).toBe(0.5);
  expect(edgeTaperFraction({ startX: 0, startY: 0, endX: 0, endY: 0 })).toBe(0.5);
});

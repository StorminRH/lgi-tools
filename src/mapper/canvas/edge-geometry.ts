import type { ChainPosition } from '../chain/intents';
import { SYSTEM_DISC_SIZE } from './SystemNode';

const DISC_RADIUS = SYSTEM_DISC_SIZE / 2;

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameSegment {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

export function frameCenter(frame: FrameRect): ChainPosition {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

export interface RayPoint {
  readonly x: number;
  readonly y: number;
}

export function pointOnRayAtRadius(
  origin: RayPoint,
  toward: RayPoint,
  radius: number,
): RayPoint | null {
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return null;
  const t = radius / distance;
  return { x: origin.x + dx * t, y: origin.y + dy * t };
}

export function frameSegment(
  source: FrameRect,
  target: FrameRect,
): FrameSegment | null {
  const from = frameCenter(source);
  const to = frameCenter(target);
  const startPt = pointOnRayAtRadius(from, to, DISC_RADIUS);
  const endPt = pointOnRayAtRadius(to, from, DISC_RADIUS);
  if (startPt === null || endPt === null) return null;
  if (Math.hypot(to.x - from.x, to.y - from.y) <= DISC_RADIUS * 2) return null;
  return {
    startX: startPt.x,
    startY: startPt.y,
    endX: endPt.x,
    endY: endPt.y,
  };
}

export interface EdgeEndpointNode {
  readonly internals: { readonly positionAbsolute: { readonly x: number; readonly y: number } };
  readonly measured: { readonly width?: number; readonly height?: number };
  readonly width?: number;
  readonly height?: number;
}

export function endpointFrame(node: EdgeEndpointNode | undefined): FrameRect | null {
  if (node === undefined) return null;
  const width = node.measured.width ?? node.width;
  const height = node.measured.height ?? node.height;
  if (width === undefined || height === undefined) return null;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width,
    height,
  };
}

function endpointSegment(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
): FrameSegment | null {
  const from = endpointFrame(source);
  const to = endpointFrame(target);
  if (from === null || to === null) return null;
  return frameSegment(from, to);
}

function segmentPath(segment: FrameSegment, start: number, end: number): string {
  const dx = segment.endX - segment.startX;
  const dy = segment.endY - segment.startY;
  const point = (t: number) =>
    `${segment.startX + dx * t},${segment.startY + dy * t}`;
  return `M ${point(start)} L ${point(end)}`;
}

export function chainLinkPath(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
): string | null {
  const segment = endpointSegment(source, target);
  return segment === null ? null : segmentPath(segment, 0, 1);
}

export function chainLinkFogPath(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
  fogSide: 'source' | 'target',
  cut: number,
): string | null {
  const segment = endpointSegment(source, target);
  if (segment === null) return null;
  return fogSide === 'target'
    ? segmentPath(segment, 0, cut)
    : segmentPath(segment, 1 - cut, 1);
}

export function pointAlongChainLink(
  sourceFrame: FrameRect,
  targetFrame: FrameRect,
  t: number,
): { readonly x: number; readonly y: number; readonly angle: number } | null {
  const segment = frameSegment(sourceFrame, targetFrame);
  if (segment === null) return null;
  const dx = segment.endX - segment.startX;
  const dy = segment.endY - segment.startY;
  return {
    x: segment.startX + dx * t,
    y: segment.startY + dy * t,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

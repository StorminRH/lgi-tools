// Pure disc-clip geometry for chain edges, kept apart from the React component
// so the clipping policy is unit-tested rather than browser-observed.
//
// Every connection aims from frame center to frame center — the disc sits at
// that center — and is clipped where it crosses each endpoint's disc rim.
// Lines therefore run through the transparent widget frame and paint under
// the name and widget rail (the node layer sits above edges). The parametric
// point along the clipped segment is the mount seam for edge-riding widgets
// (the outbound pilot arrow first).
import type { ChainPosition } from '../chain/intents';
import { SYSTEM_DISC_SIZE } from './SystemNode';

/** Radius of the visible system disc; clip math uses this, not the frame box. */
const DISC_RADIUS = SYSTEM_DISC_SIZE / 2;

/** One node's frame box in flow coordinates: top-left corner plus dimensions. */
export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A drawable straight segment between two disc rims. */
export interface FrameSegment {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

/** The center of one frame box. */
export function frameCenter(frame: FrameRect): ChainPosition {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

/** A flow or screen point used by disc-rim clipping. */
export interface RayPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The point at `radius` along the ray from `origin` toward `toward`, or
 * `null` when the ray has no length. Edges and the node-card leader share
 * this so both terminate on the same disc rim.
 */
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

/**
 * The straight segment from one disc rim to another's, aimed through both
 * frame centers, or `null` when the discs touch or overlap along that line
 * and no visible segment remains.
 */
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

/** The node facts the edge path needs; a structural slice of React Flow's internal node. */
export interface EdgeEndpointNode {
  readonly internals: { readonly positionAbsolute: { readonly x: number; readonly y: number } };
  readonly measured: { readonly width?: number; readonly height?: number };
  /** v12 declared frame dimensions — present from first render for chain nodes. */
  readonly width?: number;
  readonly height?: number;
}

/**
 * One endpoint's frame box, or `null` while a dimension is unknown. Mirrors
 * React Flow's own resolution order (measured, then declared) so the clip
 * always agrees with the wrapper the library actually rendered; declared
 * dimensions make the box available before the ResizeObserver's first pass.
 */
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

/** The clipped segment between two endpoint nodes, or `null` when unknowable. */
function endpointSegment(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
): FrameSegment | null {
  const from = endpointFrame(source);
  const to = endpointFrame(target);
  if (from === null || to === null) return null;
  return frameSegment(from, to);
}

/** The SVG path for a sub-span `[start, end]` (fractions) of one segment. */
function segmentPath(segment: FrameSegment, start: number, end: number): string {
  const dx = segment.endX - segment.startX;
  const dy = segment.endY - segment.startY;
  const point = (t: number) =>
    `${segment.startX + dx * t},${segment.startY + dy * t}`;
  return `M ${point(start)} L ${point(end)}`;
}

/**
 * The SVG path for one disc-clipped connection, or `null` while either
 * endpoint is missing or has no known dimensions, or when the discs touch
 * and no visible segment remains.
 */
export function chainLinkPath(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
): string | null {
  const segment = endpointSegment(source, target);
  return segment === null ? null : segmentPath(segment, 0, 1);
}

/**
 * The SVG path for the drawn stub of a fogged-endpoint connection: the
 * clipped segment truncated to `cut` of its length from the non-fogged end,
 * so the line visibly runs into the cloud and ends short of the invisible
 * endpoint (4.0.4.2.3 OW4). `fogSide` names which endpoint sits under fog.
 */
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

/**
 * The point a fraction `t` (0 = source disc rim, 1 = target disc rim) along
 * the clipped segment between two nodes, with the segment's heading in
 * degrees (CSS-rotation-ready, source toward target), or `null` when no
 * visible segment exists. This is the parametric mount seam for edge-riding
 * widgets such as the outbound pilot arrow.
 */
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

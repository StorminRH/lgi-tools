// Pure frame-clip geometry for chain edges, kept apart from the React component
// so the clipping policy is unit-tested rather than browser-observed.
//
// Every connection aims from frame center to frame center — the disc sits at
// that center, so lines still point at the visible disc — and is clipped where
// it crosses each endpoint's frame boundary. The parametric point along the
// clipped segment is the mount seam for edge-riding widgets (the outbound
// pilot arrow first).
import type { ChainPosition } from '../chain/intents';

/** One node's frame box in flow coordinates: top-left corner plus dimensions. */
export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A drawable straight segment between two frame boundaries. */
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

/**
 * Where the center-to-center ray exits a frame, as a fraction of the full
 * center distance. The ray starts at the frame's own center, so the exit is
 * the nearer boundary crossing along either axis.
 */
function exitFraction(frame: FrameRect, dx: number, dy: number): number {
  const tx = dx === 0 ? Infinity : frame.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : frame.height / 2 / Math.abs(dy);
  return Math.min(tx, ty);
}

/**
 * The straight segment from one frame's boundary to another's, aimed through
 * both centers, or `null` when the frames touch or overlap along that line and
 * no visible segment remains.
 */
export function frameSegment(
  source: FrameRect,
  target: FrameRect,
): FrameSegment | null {
  const from = frameCenter(source);
  const to = frameCenter(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;

  const start = exitFraction(source, dx, dy);
  const end = 1 - exitFraction(target, dx, dy);
  if (start >= end) return null;
  return {
    startX: from.x + dx * start,
    startY: from.y + dy * start,
    endX: from.x + dx * end,
    endY: from.y + dy * end,
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

/**
 * The SVG path for one frame-clipped connection, or `null` while either
 * endpoint is missing or has no known dimensions, or when the frames touch
 * and no visible segment remains.
 */
export function chainLinkPath(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
): string | null {
  const from = endpointFrame(source);
  const to = endpointFrame(target);
  if (from === null || to === null) return null;

  const segment = frameSegment(from, to);
  if (segment === null) return null;
  return `M ${segment.startX},${segment.startY} L ${segment.endX},${segment.endY}`;
}

/**
 * The point a fraction `t` (0 = source boundary, 1 = target boundary) along
 * the clipped segment between two frames, with the segment's heading in
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

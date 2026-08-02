// Pure rim-clip geometry for chain edges, kept apart from the React component
// so the clipping policy is unit-tested rather than browser-observed.
import type { ChainPosition } from '../chain/intents';
import { distance } from '../layout/trig';

/** A drawable straight segment between two disc rims. */
export interface RimSegment {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

/**
 * The straight segment from one disc's rim to another's, aimed through both
 * centers, or `null` when the discs touch or overlap and no visible segment
 * remains.
 */
export function rimSegment(
  from: ChainPosition,
  to: ChainPosition,
  radius: number,
): RimSegment | null {
  const length = distance(from, to);
  if (length <= 2 * radius) return null;

  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  return {
    startX: from.x + ux * radius,
    startY: from.y + uy * radius,
    endX: to.x - ux * radius,
    endY: to.y - uy * radius,
  };
}

/** The node facts the edge path needs; a structural slice of React Flow's internal node. */
export interface EdgeEndpointNode {
  readonly internals: { readonly positionAbsolute: { readonly x: number; readonly y: number } };
  readonly measured: { readonly width?: number };
}

/**
 * The SVG path for one rim-clipped connection, or `null` while either endpoint
 * is missing or unmeasured (the ResizeObserver fills `measured` after first
 * render; drawing before that would anchor edges to the nodes' left borders)
 * or when the discs touch and no visible segment remains.
 */
export function chainLinkPath(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
  radius: number,
): string | null {
  const from = discCenter(source, radius);
  const to = discCenter(target, radius);
  if (from === null || to === null) return null;

  const segment = rimSegment(from, to, radius);
  if (segment === null) return null;
  return `M ${segment.startX},${segment.startY} L ${segment.endX},${segment.endY}`;
}

/** The disc center in flow coordinates, or `null` before the node is measured. */
function discCenter(
  node: EdgeEndpointNode | undefined,
  radius: number,
): ChainPosition | null {
  if (node === undefined || node.measured.width === undefined) return null;
  return {
    x: node.internals.positionAbsolute.x + node.measured.width / 2,
    y: node.internals.positionAbsolute.y + radius,
  };
}

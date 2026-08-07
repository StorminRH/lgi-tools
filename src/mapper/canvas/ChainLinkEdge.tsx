'use client';

// One chain connection, drawn frame boundary to frame boundary.
//
// The floating-edge pattern: instead of anchoring to handle positions (whose
// library CSS nudges them off-center), the edge computes its line from frame
// center to frame center clipped to each endpoint's own frame box — so every
// connection aims at the centered disc and terminates exactly on the widget
// frame's boundary, with no reliance on the frame masking anything. The whole
// policy (unknown dimensions, touching frames, the path itself) lives in
// `edge-geometry.ts`, where it is unit-tested; this component only binds it
// to React Flow.
//
// Motion (4.0.3.2): an entering/departing edge carries a flavor class from the
// derived `data.motion` — fade (opacity only) or grow (pathLength-normalized
// stroke-dash draw from the parent end). Dashed loop edges never receive the
// grow flavor, so the structural dash channel cannot lie mid-animation; the
// derivation enforces that and `edgeMotionClass` renders whatever it is told.
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';
import type { ChainEdgeData } from '../chain/nodes';
import { FOG_EDGE_CUT_FRACTION } from '../fog/fog-model';
import type { EdgeMotion } from '../motion/motion-contract';
import { useOutboundArrow } from '../tracking/outbound-arrow-context';
import {
  chainLinkFogPath,
  chainLinkPath,
  endpointFrame,
  pointAlongChainLink,
  type EdgeEndpointNode,
} from './edge-geometry';

/** The edge type key registered with React Flow. */
export const CHAIN_EDGE_TYPE = 'chainLink';

/** Dash pattern for loop-closing connections — structure stays solid, shortcuts read as overlays. */
const LOOP_DASH_CLASS = '[stroke-dasharray:6_4]';

/** The stylesheet class for one edge's motion presentation, or `null` at rest. */
export function edgeMotionClass(motion: EdgeMotion | undefined): string | null {
  if (motion === undefined) return null;
  if (motion.flavor === 'grow') {
    const base =
      motion.phase === 'entering'
        ? 'map-edge-grow-enter'
        : motion.heavy
          ? 'map-edge-grow-exit-heavy'
          : 'map-edge-grow-exit';
    return motion.reverse ? `${base}-rev` : base;
  }
  if (motion.phase === 'entering') return 'map-edge-fade-enter';
  return motion.heavy ? 'map-edge-fade-exit-heavy' : 'map-edge-fade-exit';
}

/**
 * What one edge's data renders as: its class list and, for the grow flavor,
 * the `pathLength` normalization that puts stroke-dash in [0, 1] — loop edges
 * never grow, so their 6_4 dash pattern keeps its pixel units. Pure and
 * exported so the mapping is a unit test, not a browser observation.
 */
export function edgePresentation(data: ChainEdgeData | undefined): {
  readonly pathLength: number | undefined;
  readonly className: string | undefined;
} {
  const classes = cn(
    data?.loop === true && LOOP_DASH_CLASS,
    data?.tombstoneState === 'dying' && 'map-edge-dying',
    // Derived halo gate links read dimmer than authored truth (DC-3's
    // visibly-provisional rule applied to lines).
    data?.halo === true && 'map-edge-derived',
    edgeMotionClass(data?.motion),
  );
  return {
    pathLength: data?.motion?.flavor === 'grow' ? 1 : undefined,
    className: classes.length === 0 ? undefined : classes,
  };
}

/**
 * Where along the clipped segment the outbound arrow sits (0 = inward
 * boundary, 1 = outward boundary): far enough out to read as "beyond here",
 * clear of the endpoint frame.
 */
const ARROW_EDGE_FRACTION = 0.7;

/**
 * The outbound pilot arrow, mounted through React Flow's edge-label seam —
 * a portal inside the viewport transform, so the arrow lives in world space
 * and scales with the map like every other canvas element. Placement flows
 * through the stylesheet's `--map-pilot-arrow-transform` custom property via
 * CSSOM (house no-JSX-style rule); pointer events stay off end to end (the
 * label container is inert and the class keeps the arrow so).
 */
function OutboundArrowLabel({
  source,
  target,
  towardTarget,
}: {
  readonly source: EdgeEndpointNode;
  readonly target: EdgeEndpointNode;
  readonly towardTarget: boolean;
}) {
  const arrowRef = useRef<HTMLSpanElement>(null);
  const sourceFrame = endpointFrame(source);
  const targetFrame = endpointFrame(target);
  const point =
    sourceFrame === null || targetFrame === null
      ? null
      : pointAlongChainLink(
          towardTarget ? sourceFrame : targetFrame,
          towardTarget ? targetFrame : sourceFrame,
          ARROW_EDGE_FRACTION,
        );
  const transform =
    point === null
      ? null
      : `translate(-50%, -50%) translate(${point.x}px, ${point.y}px) rotate(${point.angle}deg)`;

  useLayoutEffect(() => {
    if (transform === null) return;
    arrowRef.current?.style.setProperty('--map-pilot-arrow-transform', transform);
  }, [transform]);

  if (transform === null) return null;
  return (
    <EdgeLabelRenderer>
      <span
        ref={arrowRef}
        aria-hidden
        data-pilot-arrow
        className="map-pilot-arrow text-isk"
      >
        <svg viewBox="0 0 12 12" className="size-3" fill="currentColor">
          <path d="M2 1 L11 6 L2 11 Z" />
        </svg>
      </span>
    </EdgeLabelRenderer>
  );
}

/** Renders one connection as a straight segment clipped to both frame boxes. */
function ChainLinkEdgeComponent({
  id,
  source,
  target,
  data,
}: EdgeProps<Edge<ChainEdgeData, typeof CHAIN_EDGE_TYPE>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const arrow = useOutboundArrow(id);
  // A fogged-endpoint line draws only its stub into the cloud (OW4).
  const path =
    data?.fogSide === undefined
      ? chainLinkPath(sourceNode, targetNode)
      : chainLinkFogPath(sourceNode, targetNode, data.fogSide, FOG_EDGE_CUT_FRACTION);
  if (path === null) return null;

  const presentation = edgePresentation(data);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        pathLength={presentation.pathLength}
        className={presentation.className}
      />
      {arrow !== null && sourceNode !== undefined && targetNode !== undefined && (
        <OutboundArrowLabel
          source={sourceNode}
          target={targetNode}
          towardTarget={arrow.towardSystemId === Number(target)}
        />
      )}
    </>
  );
}

/**
 * Memoized: parent re-renders with unchanged props skip this edge entirely;
 * per-frame endpoint tracking still flows through `useInternalNode`'s store
 * subscription, which bypasses the memo by design — that is what keeps an
 * edge glued to its moving endpoints.
 */
export const ChainLinkEdge = memo(ChainLinkEdgeComponent);

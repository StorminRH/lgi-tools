'use client';

// One chain connection, drawn rim to rim.
//
// The floating-edge pattern: instead of anchoring to handle positions (whose
// library CSS nudges them off-center), the edge computes its line from disc
// center to disc center clipped to each circle's circumference — so every
// connection aims at the true center and terminates exactly on the rim, with
// no reliance on the disc masking anything. The whole policy (unmeasured
// nodes, touching discs, the path itself) lives in `edge-geometry.ts`, where
// it is unit-tested; this component only binds it to React Flow.
//
// Motion (4.0.3.2): an entering/departing edge carries a flavor class from the
// derived `data.motion` — fade (opacity only) or grow (pathLength-normalized
// stroke-dash draw from the parent end). Dashed loop edges never receive the
// grow flavor, so the structural dash channel cannot lie mid-animation; the
// derivation enforces that and `edgeMotionClass` renders whatever it is told.
import {
  BaseEdge,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/components/ui/cn';
import type { ChainEdgeData, EdgeMotion } from '../chain/nodes';
import { chainLinkPath } from './edge-geometry';
import { SYSTEM_DISC_RADIUS } from './SystemNode';

/** The edge type key registered with React Flow. */
export const CHAIN_EDGE_TYPE = 'chainLink';

/** Dash pattern for loop-closing connections — structure stays solid, shortcuts read as overlays. */
const LOOP_DASH_CLASS = '[stroke-dasharray:6_4]';

/** The stylesheet class for one edge's motion presentation, or `null` at rest. */
export function edgeMotionClass(motion: EdgeMotion | undefined): string | null {
  if (motion === undefined) return null;
  if (motion.flavor === 'grow') {
    const base = motion.phase === 'entering' ? 'map-edge-grow-enter' : 'map-edge-grow-exit';
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
    edgeMotionClass(data?.motion),
  );
  return {
    pathLength: data?.motion?.flavor === 'grow' ? 1 : undefined,
    className: classes.length === 0 ? undefined : classes,
  };
}

/** Renders one connection as a straight segment clipped to both discs' rims. */
function ChainLinkEdgeComponent({
  id,
  source,
  target,
  data,
}: EdgeProps<Edge<ChainEdgeData, typeof CHAIN_EDGE_TYPE>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const path = chainLinkPath(sourceNode, targetNode, SYSTEM_DISC_RADIUS);
  if (path === null) return null;

  const presentation = edgePresentation(data);
  return (
    <BaseEdge
      id={id}
      path={path}
      pathLength={presentation.pathLength}
      className={presentation.className}
    />
  );
}

/**
 * Memoized: parent re-renders with unchanged props skip this edge entirely;
 * per-frame endpoint tracking still flows through `useInternalNode`'s store
 * subscription, which bypasses the memo by design — that is what keeps an
 * edge glued to its moving endpoints.
 */
export const ChainLinkEdge = memo(ChainLinkEdgeComponent);

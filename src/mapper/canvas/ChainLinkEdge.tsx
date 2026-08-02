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
import {
  BaseEdge,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { ChainEdgeData } from '../chain/nodes';
import { chainLinkPath } from './edge-geometry';
import { SYSTEM_DISC_RADIUS } from './SystemNode';

/** The edge type key registered with React Flow. */
export const CHAIN_EDGE_TYPE = 'chainLink';

/** Dash pattern for loop-closing connections — structure stays solid, shortcuts read as overlays. */
const LOOP_DASH_CLASS = '[stroke-dasharray:6_4]';

/** Renders one connection as a straight segment clipped to both discs' rims. */
export function ChainLinkEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<Edge<ChainEdgeData, typeof CHAIN_EDGE_TYPE>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const path = chainLinkPath(sourceNode, targetNode, SYSTEM_DISC_RADIUS);
  if (path === null) return null;

  return (
    <BaseEdge
      id={id}
      path={path}
      className={data?.loop === true ? LOOP_DASH_CLASS : undefined}
    />
  );
}

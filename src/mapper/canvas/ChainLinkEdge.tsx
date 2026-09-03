'use client';

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

export const CHAIN_EDGE_TYPE = 'chainLink';

export const CHAIN_EDGE_INTERACTION_WIDTH = 32;

const LOOP_DASH_CLASS = '[stroke-dasharray:6_4]';

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

export function edgePresentation(data: ChainEdgeData | undefined): {
  readonly pathLength: number | undefined;
  readonly className: string | undefined;
} {
  const classes = cn(
    data?.loop === true && LOOP_DASH_CLASS,
    data?.tombstoneState === 'dying' && 'map-edge-dying',
    (data?.halo === true || data?.stub === true) && 'map-edge-derived',
    edgeMotionClass(data?.motion),
  );
  return {
    pathLength: data?.motion?.flavor === 'grow' ? 1 : undefined,
    className: classes.length === 0 ? undefined : classes,
  };
}

const ARROW_EDGE_FRACTION = 0.7;

const ARROW_FOG_STUB_BACKOFF = 0.9;

export function outboundArrowFraction(
  fogSide: 'source' | 'target' | undefined,
): number {
  if (fogSide === undefined) return ARROW_EDGE_FRACTION;
  return FOG_EDGE_CUT_FRACTION * ARROW_FOG_STUB_BACKOFF;
}

function OutboundArrowLabel({
  source,
  target,
  towardTarget,
  fraction,
  live,
}: {
  readonly source: EdgeEndpointNode;
  readonly target: EdgeEndpointNode;
  readonly towardTarget: boolean;
  readonly fraction: number;
  readonly live: boolean;
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
          fraction,
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
        className={cn('map-pilot-arrow', live ? 'text-isk' : 'text-muted')}
      >
        <svg viewBox="0 0 12 12" className="size-3" fill="currentColor">
          <path d="M2 1 L11 6 L2 11 Z" />
        </svg>
      </span>
    </EdgeLabelRenderer>
  );
}

function ChainLinkEdgeComponent({
  id,
  source,
  target,
  data,
}: EdgeProps<Edge<ChainEdgeData, typeof CHAIN_EDGE_TYPE>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const arrow = useOutboundArrow(id);
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
        interactionWidth={CHAIN_EDGE_INTERACTION_WIDTH}
      />
      {arrow !== null && sourceNode !== undefined && targetNode !== undefined && (
        <OutboundArrowLabel
          source={sourceNode}
          target={targetNode}
          towardTarget={arrow.towardSystemId === Number(target)}
          fraction={outboundArrowFraction(data?.fogSide)}
          live={arrow.live}
        />
      )}
    </>
  );
}

export const ChainLinkEdge = memo(ChainLinkEdgeComponent);

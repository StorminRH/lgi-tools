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
import type { OutboundArrow } from '../tracking/pilot-path';
import {
  chainLinkFogPath,
  chainLinkPath,
  chainLinkSegment,
  connectionLabelBox,
  edgeTaperFraction,
  endpointFrame,
  pointAlongChainLink,
  type EdgeEndpointNode,
  type FrameSegment,
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
  const labels = {
    source: connectionLabelBox(source.data),
    target: connectionLabelBox(target.data),
  };
  const point =
    sourceFrame === null || targetFrame === null
      ? null
      : pointAlongChainLink(
          towardTarget ? sourceFrame : targetFrame,
          towardTarget ? targetFrame : sourceFrame,
          fraction,
          towardTarget ? labels : { source: labels.target, target: labels.source },
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

function taperGradientId(edgeId: string): string {
  return `map-edge-taper-${edgeId.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function linkStroke(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
  fogSide: 'source' | 'target' | undefined,
): { readonly path: string; readonly segment: FrameSegment; readonly taper: number } | null {
  const segment = chainLinkSegment(source, target);
  if (segment === null) return null;
  const path =
    fogSide === undefined
      ? chainLinkPath(source, target)
      : chainLinkFogPath(source, target, fogSide, FOG_EDGE_CUT_FRACTION);
  if (path === null) return null;
  return { path, segment, taper: edgeTaperFraction(segment) };
}

function EdgeTaper({
  gradientId,
  segment,
  taper,
}: {
  readonly gradientId: string;
  readonly segment: FrameSegment;
  readonly taper: number;
}) {
  return (
    <linearGradient
      id={gradientId}
      gradientUnits="userSpaceOnUse"
      x1={segment.startX}
      y1={segment.startY}
      x2={segment.endX}
      y2={segment.endY}
    >
      <stop className="map-edge-taper-stop" offset="0" stopOpacity="0" />
      <stop className="map-edge-taper-stop" offset={taper} stopOpacity="1" />
      <stop className="map-edge-taper-stop" offset={1 - taper} stopOpacity="1" />
      <stop className="map-edge-taper-stop" offset="1" stopOpacity="0" />
    </linearGradient>
  );
}

function PilotArrow({
  arrow,
  sourceNode,
  targetNode,
  targetId,
  fogSide,
}: {
  readonly arrow: OutboundArrow | null;
  readonly sourceNode: EdgeEndpointNode | undefined;
  readonly targetNode: EdgeEndpointNode | undefined;
  readonly targetId: string;
  readonly fogSide: 'source' | 'target' | undefined;
}) {
  if (arrow === null || sourceNode === undefined || targetNode === undefined) return null;
  return (
    <OutboundArrowLabel
      source={sourceNode}
      target={targetNode}
      towardTarget={arrow.towardSystemId === Number(targetId)}
      fraction={outboundArrowFraction(fogSide)}
      live={arrow.live}
    />
  );
}

function ChainLinkEdgeComponent({
  id,
  source,
  target,
  data,
}: EdgeProps<Edge<ChainEdgeData, typeof CHAIN_EDGE_TYPE>>) {
  const hostRef = useRef<SVGGElement>(null);
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const arrow = useOutboundArrow(id);
  const stroke = linkStroke(sourceNode, targetNode, data?.fogSide);
  const gradientId = taperGradientId(id);
  useLayoutEffect(() => {
    hostRef.current?.style.setProperty('--map-edge-taper', `url(#${gradientId})`);
  }, [gradientId]);
  if (stroke === null) return null;

  const presentation = edgePresentation(data);
  return (
    <g ref={hostRef}>
      <defs>
        <EdgeTaper gradientId={gradientId} segment={stroke.segment} taper={stroke.taper} />
      </defs>
      <BaseEdge
        id={id}
        path={stroke.path}
        pathLength={presentation.pathLength}
        className={cn(presentation.className, 'map-edge-taper')}
        interactionWidth={CHAIN_EDGE_INTERACTION_WIDTH}
      />
      <PilotArrow
        arrow={arrow}
        sourceNode={sourceNode}
        targetNode={targetNode}
        targetId={target}
        fogSide={data?.fogSide}
      />
    </g>
  );
}

export const ChainLinkEdge = memo(ChainLinkEdgeComponent);

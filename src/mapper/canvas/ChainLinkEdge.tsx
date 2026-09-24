'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { memo, useId, useLayoutEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';
import type { ChainEdgeData } from '../chain/nodes';
import { FOG_EDGE_CUT_FRACTION } from '../fog/fog-model';
import type { EdgeMotion } from '../motion/motion-contract';
import { useOutboundArrow } from '../tracking/outbound-arrow-context';
import type { OutboundArrow } from '../tracking/pilot-path';
import {
  chainLinkPath,
  chainLinkSegment,
  edgeTaperFraction,
  pointAlongSegment,
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
  segment,
  towardTarget,
  fraction,
  live,
}: {
  readonly segment: FrameSegment;
  readonly towardTarget: boolean;
  readonly fraction: number;
  readonly live: boolean;
}) {
  const arrowRef = useRef<HTMLSpanElement>(null);
  const point = pointAlongSegment(segment, fraction, towardTarget);
  const transform = `translate(-50%, -50%) translate(${point.x}px, ${point.y}px) rotate(${point.angle}deg)`;

  useLayoutEffect(() => {
    arrowRef.current?.style.setProperty('--map-pilot-arrow-transform', transform);
  }, [transform]);

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
  segment,
  targetId,
  fogSide,
}: {
  readonly arrow: OutboundArrow | null;
  readonly segment: FrameSegment;
  readonly targetId: string;
  readonly fogSide: 'source' | 'target' | undefined;
}) {
  if (arrow === null) return null;
  return (
    <OutboundArrowLabel
      segment={segment}
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
  const segment = chainLinkSegment(sourceNode, targetNode);
  const visible = segment !== null;
  const gradientId = `map-edge-taper-${useId()}`;
  useLayoutEffect(() => {
    hostRef.current?.style.setProperty('--map-edge-taper', `url(#${gradientId})`);
  }, [gradientId, visible]);
  if (segment === null) return null;

  const path = chainLinkPath(segment, data?.fogSide, FOG_EDGE_CUT_FRACTION);

  const presentation = edgePresentation(data);
  return (
    <g ref={hostRef}>
      <defs>
        <EdgeTaper gradientId={gradientId} segment={segment} taper={edgeTaperFraction(segment)} />
      </defs>
      <BaseEdge
        id={id}
        path={path}
        pathLength={presentation.pathLength}
        className={cn(presentation.className, 'map-edge-taper')}
        interactionWidth={CHAIN_EDGE_INTERACTION_WIDTH}
      />
      <PilotArrow
        arrow={arrow}
        segment={segment}
        targetId={target}
        fogSide={data?.fogSide}
      />
    </g>
  );
}

export const ChainLinkEdge = memo(ChainLinkEdgeComponent);

'use client';

import { useMemo, type ReactNode } from 'react';
import { ChainSurface, type ChainSurfaceProps } from '../canvas/ChainSurface';
import { withEdgePointerPolicy } from '../canvas/edge-menu';
import { FogLayer } from '../fog/FogLayer';
import type { FogConfig } from '../fog/fog-model';
import type { MotionConfig } from '../motion/motion-contract';
import type { MotionTruth } from '../motion/motion-host-model';
import { BROWSER_MOTION_SEAMS, useMotion } from '../motion/use-motion';
import type { MapChainIntent } from './intents';
import type { MapAccessState } from './use-map-chain-pages';

export interface MotionLayerProps
  extends Omit<ChainSurfaceProps, 'nodes' | 'edges' | 'motion'> {
  readonly truth: MotionTruth;
  readonly intents: readonly MapChainIntent[];
  readonly access: MapAccessState;
  readonly dragging: ReadonlySet<number>;
  readonly motionConfig: MotionConfig;
  readonly fogConfig: FogConfig;
  readonly canEdit: boolean;
  readonly children?: ReactNode;
}

export function MotionLayer({
  truth,
  intents,
  access,
  dragging,
  motionConfig,
  fogConfig,
  canEdit,
  children,
  ...surface
}: MotionLayerProps) {
  const presentation = useMotion(
    truth,
    intents,
    access,
    dragging,
    motionConfig,
    BROWSER_MOTION_SEAMS,
  );
  const edges = useMemo(
    () => withEdgePointerPolicy(presentation.edges, canEdit),
    [presentation.edges, canEdit],
  );
  return (
    <ChainSurface
      nodes={presentation.nodes}
      edges={edges}
      motion={motionConfig}
      {...surface}
    >
      <FogLayer
        nodes={presentation.nodes}
        edges={edges}
        motion={motionConfig}
        config={fogConfig}
      />
      {children}
    </ChainSurface>
  );
}

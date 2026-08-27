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

/** What the motion layer needs beyond the surface's own props. */
interface MotionLayerProps
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

/**
 * The per-frame render boundary between reconciled truth and the canvas.
 *
 * `useMotion`'s frame loop re-renders THIS component, not `ChainLive`: the
 * children (controls, camera host) are created by the parent, so their element
 * identity is stable across motion frames and React bails out of re-rendering
 * them — the per-frame commit stays proportional to actual movers.
 */
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
      {/* Fog derives from the SAME presentation the surface renders, so the
          cloud can never disagree with the drawn canvas (OW4). */}
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

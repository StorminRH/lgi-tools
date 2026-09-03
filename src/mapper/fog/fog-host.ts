import {
  advanceFogFrame,
  EMPTY_FOG_FRAME_STATE,
  type FogConfig,
  type FogFrameState,
  type FogRevealSet,
} from './fog-model';
import type { MotionConfig } from '../motion/motion-contract';
import {
  decideFogPlacement,
  paintFog,
  type FogPaintContext,
  type FogPlacement,
  type FogViewportState,
} from './fog-painter';

export interface FogCanvasTarget {
  width: number;
  height: number;
  readonly style: {
    setProperty(name: string, value: string): void;
  };
}

export interface FogTickIo {
  readonly canvas: FogCanvasTarget | null;
  readonly context: FogPaintContext | null;
  readonly createBrush: () => CanvasImageSource | null;
  readonly readColor: () => string | null;
  readonly viewport: FogViewportState;
  readonly devicePixelRatio: number;
  readonly reducedMotion: boolean;
  readonly now: number;
}

export interface FogTickInputs {
  readonly reveals: FogRevealSet;
  readonly motion: MotionConfig;
  readonly config: FogConfig;
}

export interface FogHostRuntime {
  frameState: FogFrameState;
  placement: FogPlacement | null;
  brush: CanvasImageSource | null;
}

export function createFogHostRuntime(): FogHostRuntime {
  return { frameState: EMPTY_FOG_FRAME_STATE, placement: null, brush: null };
}

function applyPlacement(canvas: FogCanvasTarget, placement: FogPlacement): void {
  const { cover, scale } = placement;
  canvas.width = Math.max(1, Math.round(cover.width * scale));
  canvas.height = Math.max(1, Math.round(cover.height * scale));
  canvas.style.setProperty('left', `${cover.x}px`);
  canvas.style.setProperty('top', `${cover.y}px`);
  canvas.style.setProperty('width', `${cover.width}px`);
  canvas.style.setProperty('height', `${cover.height}px`);
}

export function runFogTick(
  runtime: FogHostRuntime,
  io: FogTickIo,
  inputs: FogTickInputs,
): boolean {
  if (io.canvas === null || io.context === null) return false;
  const advance = advanceFogFrame(
    runtime.frameState,
    inputs.reveals,
    inputs.config,
    inputs.motion,
    io.reducedMotion,
    io.now,
  );
  runtime.frameState = advance.state;

  const decision = decideFogPlacement(
    runtime.placement,
    io.viewport,
    advance.frame,
    inputs.config.revealRadius,
    io.devicePixelRatio,
  );
  const brush = (runtime.brush ??= io.createBrush());
  const color = io.readColor();
  if (decision === null || brush === null || color === null) {
    return advance.animating;
  }
  if (decision.changed) applyPlacement(io.canvas, decision.placement);
  runtime.placement = decision.placement;

  paintFog(io.context, {
    cover: decision.placement.cover,
    scale: decision.placement.scale,
    color,
    opacity: inputs.config.opacity,
    frame: advance.frame,
    wakeStamps: advance.wakeStamps,
    revealRadius: inputs.config.revealRadius,
    strokeRadius: inputs.config.strokeRadius,
    brush,
    alphaOnly: advance.alphaOnly,
  });
  return advance.animating;
}

'use client';

import {
  ViewportPortal,
  useOnViewportChange,
  useStore,
  useStoreApi,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { ChainNode } from '../canvas/SystemNode';
import type { ChainEdge } from '../chain/nodes';
import { createFrameCoalescer, type FrameCoalescer } from '../lib/frame-coalescer';
import type { MotionConfig } from '../motion/motion-contract';
import { BROWSER_MOTION_SEAMS } from '../motion/use-motion';
import { createFogHostRuntime, runFogTick } from './fog-host';
import { deriveFogReveals, sameFogReveals, type FogConfig } from './fog-model';
import { fogBrushAlpha } from './fog-painter';
import { useStableValue } from '@/lib/use-stable-value';

const FOG_BRUSH_SIZE = 256;

const FOG_BRUSH_SEED = 0x4c47_49;

export interface FogLayerProps {
  readonly nodes: readonly ChainNode[];
  readonly edges: readonly ChainEdge[];
  readonly motion: MotionConfig;
  readonly config: FogConfig;
}

function createFogBrush(): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = FOG_BRUSH_SIZE;
  canvas.height = FOG_BRUSH_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  const alpha = fogBrushAlpha(FOG_BRUSH_SIZE, FOG_BRUSH_SEED);
  const image = context.createImageData(FOG_BRUSH_SIZE, FOG_BRUSH_SIZE);
  for (let index = 0; index < alpha.length; index += 1) {
    image.data[index * 4] = 255;
    image.data[index * 4 + 1] = 255;
    image.data[index * 4 + 2] = 255;
    image.data[index * 4 + 3] = alpha[index] ?? 0;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function readFogColor(canvas: HTMLCanvasElement | null): string | null {
  if (canvas === null) return null;
  const color = getComputedStyle(canvas)
    .getPropertyValue('--color-map-fog')
    .trim();
  return color.length === 0 ? null : color;
}

export function FogLayer({ nodes, edges, motion, config }: FogLayerProps) {
  const canvasRef = useFogHost({ nodes, edges, motion, config });
  return (
    <ViewportPortal>
      <canvas ref={canvasRef} data-map-fog aria-hidden className="map-fog" />
    </ViewportPortal>
  );
}

function useFogHost({
  nodes,
  edges,
  motion,
  config,
}: FogLayerProps): RefObject<HTMLCanvasElement | null> {
  const store = useStoreApi();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef(createFogHostRuntime());
  const reveals = useStableValue(
    useMemo(() => deriveFogReveals(nodes, edges), [nodes, edges]),
    sameFogReveals,
  );
  const inputsRef = useRef({ reveals, motion, config });
  const schedule = useFogScheduler(canvasRef, runtimeRef, inputsRef, store);

  useEffect(() => {
    inputsRef.current = { reveals, motion, config };
    schedule();
  }, [reveals, motion, config, schedule]);

  const onViewportEnd = useCallback(() => schedule(), [schedule]);
  useOnViewportChange({ onEnd: onViewportEnd });

  const paneKey = useStore((state) => `${state.width}x${state.height}`);
  useEffect(() => {
    schedule();
  }, [paneKey, schedule]);

  return canvasRef;
}

function useFogScheduler(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  runtimeRef: RefObject<ReturnType<typeof createFogHostRuntime>>,
  inputsRef: RefObject<{
    reveals: ReturnType<typeof deriveFogReveals>;
    motion: MotionConfig;
    config: FogConfig;
  }>,
  store: ReturnType<typeof useStoreApi>,
): () => void {
  const frameRef = useRef<FrameCoalescer | null>(null);

  // The tick reads refs, so the coalescer that runs it is made in an effect;
  // it asks for the next frame itself while the fog is still easing. Cleanup
  // cancels without latching, so StrictMode's remount paints again.
  useEffect(() => {
    const frame = createFrameCoalescer(() => {
      const canvas = canvasRef.current;
      const again = runFogTick(
        runtimeRef.current,
        {
          canvas,
          context: canvas === null ? null : canvas.getContext('2d'),
          createBrush: createFogBrush,
          readColor: () => readFogColor(canvas),
          viewport: store.getState(),
          devicePixelRatio: window.devicePixelRatio,
          reducedMotion: BROWSER_MOTION_SEAMS.prefersReducedMotion(),
          now: performance.now(),
        },
        inputsRef.current,
      );
      if (again) frame.request();
    });
    frameRef.current = frame;
    return () => {
      frame.cancel();
      frameRef.current = null;
    };
  }, [canvasRef, inputsRef, runtimeRef, store]);

  return useCallback(() => frameRef.current?.request(), []);
}

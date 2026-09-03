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
import type { MotionConfig } from '../motion/motion-contract';
import { BROWSER_MOTION_SEAMS } from '../motion/use-motion';
import { createFogHostRuntime, runFogTick } from './fog-host';
import { deriveFogReveals, type FogConfig } from './fog-model';
import { fogBrushAlpha } from './fog-painter';

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
      {}
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
  const reveals = useMemo(() => deriveFogReveals(nodes, edges), [nodes, edges]);
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
  const frameIdRef = useRef(0);
  const tickRef = useRef<() => void>(() => undefined);

  const schedule = useCallback(() => {
    if (frameIdRef.current !== 0) return;
    frameIdRef.current = requestAnimationFrame(() => {
      frameIdRef.current = 0;
      tickRef.current();
    });
  }, []);

  const tick = useCallback(() => {
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
    if (again) schedule();
  }, [canvasRef, inputsRef, runtimeRef, schedule, store]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(
    () => () => {
      if (frameIdRef.current !== 0) cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = 0;
    },
    [],
  );

  return schedule;
}

'use client';

// The fog canvas host component: a world-anchored <canvas> mounted as the
// DIRECT child of React Flow's ViewportPortal. The portal renders after the
// node layer, so the stylesheet's `.map-fog` negative z-index is what paints
// the cloud below edges and nodes while staying above the pane backdrop
// (docs brief against the installed 12.11.2 DOM: the viewport is a stacking
// context, the portal container is not — do NOT wrap the canvas in any
// element that creates one, or the -1 gets trapped and fog covers the map).
//
// This component owns only refs, effects, and scheduling; the whole per-frame
// decision path lives tested in `fog-host.ts` (`runFogTick`), mirroring the
// motion layer's pure-model/thin-host split.
//
// Scheduling contract (PD-3 / the 4.0.3.2 idle rule): there is NO standing
// frame loop. A frame is scheduled only when presentation input changes, the
// viewport settles, or the pane resizes — and re-scheduled only while the
// tick reports animation. A settled idle map registers zero animation frames,
// which the atlas-motion-idle probe pins. Pan/zoom never repaints: the canvas
// rides the viewport CSS transform; the gesture-end callback repaints only
// when the visible rect escaped the claimed cover or the zoom's backing
// bucket flipped (`decideFogPlacement` decides).
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

/** Brush sprite resolution — soft smoke needs no more. */
const FOG_BRUSH_SIZE = 256;

/** Fixed brush seed: every client rasterizes the identical cloud (DC-2). */
const FOG_BRUSH_SEED = 0x4c47_49;

/** What the live host supplies each commit. */
export interface FogLayerProps {
  /** The motion layer's rendered presentation — the same arrays the canvas draws. */
  readonly nodes: readonly ChainNode[];
  readonly edges: readonly ChainEdge[];
  readonly motion: MotionConfig;
  readonly config: FogConfig;
}

/** The noise brush sprite, rasterized once per mount from the pure alpha map. */
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

/** The cloud color from the theme token; `null` while unresolved. */
function readFogColor(canvas: HTMLCanvasElement | null): string | null {
  if (canvas === null) return null;
  const color = getComputedStyle(canvas)
    .getPropertyValue('--color-map-fog')
    .trim();
  return color.length === 0 ? null : color;
}

/**
 * Renders the RTS fog-of-war cloud over the map canvas, revealing the drawn
 * chain. Must mount inside `<ReactFlow>` (ChainSurface's children slot).
 */
export function FogLayer({ nodes, edges, motion, config }: FogLayerProps) {
  const canvasRef = useFogHost({ nodes, edges, motion, config });
  return (
    <ViewportPortal>
      {/* Direct portal child by contract — see the stacking note above. */}
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
  // Scheduler publishes tickRef before this host's schedule-firing effects run
  // in the same commit, so the first paint cannot call a stale tick.
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

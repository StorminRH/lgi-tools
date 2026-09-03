import { describe, expect, it } from 'vitest';
import { DEFAULT_MOTION_CONFIG } from '../motion/motion-contract';
import { createFogHostRuntime, runFogTick, type FogTickIo } from './fog-host';
import { DEFAULT_FOG_CONFIG, deriveFogReveals } from './fog-model';
import type { FogPaintContext } from './fog-painter';
import {
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
  type ChainNode,
} from '../canvas/SystemNode';

function chainNode(id: number, x: number, y: number): ChainNode {
  return {
    id: String(id),
    type: 'chainSystem',
    width: SYSTEM_FRAME_WIDTH,
    height: SYSTEM_FRAME_HEIGHT,
    position: { x, y },
    data: { name: `S${id}`, className: null },
  };
}

interface StubCanvas {
  width: number;
  height: number;
  readonly style: { setProperty(name: string, value: string): void };
  readonly styles: Record<string, string>;
}

function stubCanvas(): StubCanvas {
  const styles: Record<string, string> = {};
  return {
    width: 0,
    height: 0,
    styles,
    style: {
      setProperty(name: string, value: string) {
        styles[name] = value;
      },
    },
  };
}

function stubContext(): { ctx: FogPaintContext; ops: string[] } {
  const ops: string[] = [];
  const ctx: FogPaintContext = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    setTransform: () => ops.push('setTransform'),
    clearRect: () => ops.push('clearRect'),
    fillRect: () => ops.push('fillRect'),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    translate: () => ops.push('translate'),
    rotate: () => ops.push('rotate'),
    drawImage: () => ops.push('drawImage'),
  };
  return { ctx, ops };
}

const BRUSH = { width: 8, height: 8 } as unknown as CanvasImageSource;

function tickIo(
  canvas: StubCanvas | null,
  ctx: FogPaintContext | null,
  overrides: Partial<FogTickIo> = {},
): FogTickIo {
  return {
    canvas,
    context: ctx,
    createBrush: () => BRUSH,
    readColor: () => 'fog-token',
    viewport: { transform: [0, 0, 1], width: 1000, height: 800 },
    devicePixelRatio: 1,
    reducedMotion: false,
    now: 1000,
    ...overrides,
  };
}

const INPUTS = {
  reveals: deriveFogReveals([chainNode(1, 0, 0), chainNode(2, 300, 0)], []),
  motion: DEFAULT_MOTION_CONFIG,
  config: DEFAULT_FOG_CONFIG,
};

describe('runFogTick', () => {
  it('does nothing without a canvas or context', () => {
    const runtime = createFogHostRuntime();
    expect(runFogTick(runtime, tickIo(null, null), INPUTS)).toBe(false);
    expect(runFogTick(runtime, tickIo(stubCanvas(), null), INPUTS)).toBe(false);
    expect(runtime.placement).toBeNull();
  });

  it('claims a placement, sizes the canvas, and paints one settled frame', () => {
    const runtime = createFogHostRuntime();
    const canvas = stubCanvas();
    const { ctx, ops } = stubContext();

    const again = runFogTick(runtime, tickIo(canvas, ctx), INPUTS);

    expect(again).toBe(false);
    expect(runtime.placement).not.toBeNull();
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.styles['left']).toMatch(/px$/);
    expect(canvas.styles['width']).toMatch(/px$/);
    expect(ops.filter((op) => op === 'fillRect')).toHaveLength(1);
    expect(ops.filter((op) => op === 'drawImage').length).toBeGreaterThan(0);
  });

  it('keeps the placement (no resize) when the cover still holds', () => {
    const runtime = createFogHostRuntime();
    const canvas = stubCanvas();
    const { ctx } = stubContext();
    runFogTick(runtime, tickIo(canvas, ctx), INPUTS);
    const placement = runtime.placement;
    canvas.width = -1;

    runFogTick(runtime, tickIo(canvas, ctx), INPUTS);
    expect(runtime.placement?.cover).toBe(placement?.cover);
    expect(canvas.width).toBe(-1);
  });

  it('advances time but skips painting while the pane has no size', () => {
    const runtime = createFogHostRuntime();
    const canvas = stubCanvas();
    const { ctx, ops } = stubContext();

    const again = runFogTick(
      runtime,
      tickIo(canvas, ctx, {
        viewport: { transform: [0, 0, 1], width: 0, height: 0 },
      }),
      INPUTS,
    );
    expect(ops).toHaveLength(0);
    expect(again).toBe(false);

    expect(runtime.frameState.timeline.size).toBeGreaterThan(0);
  });

  it('advances without paint until the color token resolves, then paints', () => {
    const runtime = createFogHostRuntime();
    const canvas = stubCanvas();
    const { ctx, ops } = stubContext();

    runFogTick(runtime, tickIo(canvas, ctx, { readColor: () => null }), INPUTS);
    expect(ops).toHaveLength(0);
    expect(runtime.placement).toBeNull();
    expect(runtime.frameState.timeline.size).toBeGreaterThan(0);

    runFogTick(runtime, tickIo(canvas, ctx), INPUTS);
    expect(ops.filter((op) => op === 'fillRect')).toHaveLength(1);
  });

  it('reports animation for a later-arriving reveal so the host loops', () => {
    const runtime = createFogHostRuntime();
    const canvas = stubCanvas();
    const { ctx } = stubContext();
    runFogTick(runtime, tickIo(canvas, ctx), INPUTS);

    const grown = {
      ...INPUTS,
      reveals: deriveFogReveals(
        [chainNode(1, 0, 0), chainNode(2, 300, 0), chainNode(3, 0, 300)],
        [],
      ),
    };
    expect(runFogTick(runtime, tickIo(canvas, ctx, { now: 1100 }), grown)).toBe(true);
    expect(
      runFogTick(runtime, tickIo(canvas, ctx, { now: 5000 }), grown),
    ).toBe(false);
  });

  it('caches the brush across ticks', () => {
    const runtime = createFogHostRuntime();
    const canvas = stubCanvas();
    const { ctx } = stubContext();
    let created = 0;
    const io = () =>
      tickIo(canvas, ctx, {
        createBrush: () => {
          created += 1;
          return BRUSH;
        },
      });
    runFogTick(runtime, io(), INPUTS);
    runFogTick(runtime, io(), INPUTS);
    expect(created).toBe(1);
  });
});

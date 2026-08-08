import { assert, expect, test } from 'vitest';
import type { FogFrame } from './fog-model';
import {
  decideFogPlacement,
  FOG_MAX_BACKING_PIXELS,
  fogBackingScale,
  fogBrushAlpha,
  fogContentBounds,
  fogCoverContains,
  fogCoverRect,
  paintFog,
  type FogPaintContext,
  type FogPaintInput,
  type FogRect,
} from './fog-painter';

const FRAME: FogFrame = {
  timeline: new Map(),
  discs: [
    { key: 'd:1', x: 100, y: 50, strength: 1 },
    { key: 'd:2', x: 300, y: 50, strength: 0.5 },
  ],
  strokes: [{ key: 's:a', x1: 100, y1: 50, x2: 300, y2: 50, strength: 1 }],
  animating: false,
};

interface Recorded {
  readonly op: string;
  readonly args: readonly (string | number)[];
}

function recordingContext(): { ctx: FogPaintContext; log: Recorded[] } {
  const log: Recorded[] = [];
  let alpha = 1;
  let composite = 'source-over';
  const ctx: FogPaintContext = {
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(value: number) {
      alpha = value;
      log.push({ op: 'alpha', args: [value] });
    },
    get globalCompositeOperation() {
      return composite;
    },
    set globalCompositeOperation(value: string) {
      composite = value;
      log.push({ op: 'composite', args: [value] });
    },
    fillStyle: '',
    setTransform: (...args) => log.push({ op: 'setTransform', args }),
    clearRect: (...args) => log.push({ op: 'clearRect', args }),
    fillRect: (...args) => log.push({ op: 'fillRect', args }),
    save: () => log.push({ op: 'save', args: [] }),
    restore: () => log.push({ op: 'restore', args: [] }),
    translate: (...args) => log.push({ op: 'translate', args }),
    rotate: (...args) => log.push({ op: 'rotate', args }),
    drawImage: (_image, ...args) => log.push({ op: 'drawImage', args }),
  };
  return { ctx, log };
}

function paintInput(overrides: Partial<FogPaintInput> = {}): FogPaintInput {
  return {
    cover: { x: -100, y: -100, width: 600, height: 400 },
    scale: 2,
    color: 'fog-token',
    opacity: 0.9,
    frame: FRAME,
    wakeStamps: [{ key: 'w:d:1', x: 150, y: 50, strength: 0.5 }],
    revealRadius: 170,
    strokeRadius: 50,
    brush: { width: 256, height: 256 } as unknown as CanvasImageSource,
    alphaOnly: false,
    ...overrides,
  };
}

test('fog cover math bounds content, pans cover, and degrades backing scale', () => {
  expect(fogContentBounds({ ...FRAME, discs: [], strokes: [] }, 10)).toBeNull();
  expect(fogContentBounds(FRAME, 10)).toEqual({
    x: 90,
    y: 40,
    width: 220,
    height: 20,
  });

  const visible: FogRect = { x: 0, y: 0, width: 100, height: 100 };
  const alone = fogCoverRect(visible, null);
  expect(alone).toEqual({ x: -50, y: -50, width: 200, height: 200 });
  const withContent = fogCoverRect(visible, { x: -500, y: 0, width: 100, height: 100 });
  expect(withContent.x).toBe(-500);
  expect(withContent.x + withContent.width).toBe(150);
  expect(fogCoverContains(withContent, visible)).toBe(true);
  expect(fogCoverContains(alone, { x: 140, y: 0, width: 100, height: 100 })).toBe(false);

  const small: FogRect = { x: 0, y: 0, width: 500, height: 500 };
  expect(fogBackingScale(small, 1, 2)).toBe(2);
  expect(fogBackingScale(small, 0.7, 1)).toBe(1);
  expect(fogBackingScale(small, 2.5, 2)).toBe(4);

  const huge: FogRect = { x: 0, y: 0, width: 100_000, height: 100_000 };
  const degraded = fogBackingScale(huge, 2.5, 2);
  expect(degraded).toBeLessThan(1);
  expect(huge.width * degraded * (huge.height * degraded)).toBeLessThanOrEqual(
    FOG_MAX_BACKING_PIXELS * 1.001,
  );
});

test('decideFogPlacement claims, keeps, pans, and zoom-bucket flips', () => {
  const viewport = (zoom = 1, width = 1000, height = 800) => ({
    transform: [0, 0, zoom] as const,
    width,
    height,
  });

  expect(decideFogPlacement(null, viewport(1, 0, 0), FRAME, 170, 1)).toBeNull();

  const first = decideFogPlacement(null, viewport(), FRAME, 170, 1);
  assert.isNotNull(first);
  expect(first.changed).toBe(true);
  expect(
    fogCoverContains(first.placement.cover, { x: 0, y: 0, width: 1000, height: 800 }),
  ).toBe(true);

  const kept = decideFogPlacement(first.placement, viewport(), FRAME, 170, 1);
  expect(kept?.changed).toBe(false);
  expect(kept?.placement.cover).toBe(first.placement.cover);

  const panned = decideFogPlacement(
    first.placement,
    { transform: [-5000, 0, 1] as const, width: 1000, height: 800 },
    FRAME,
    170,
    1,
  );
  expect(panned?.changed).toBe(true);
  expect(panned?.placement.cover).not.toBe(first.placement.cover);

  const zoomed = decideFogPlacement(first.placement, viewport(1.8), FRAME, 170, 1);
  expect(zoomed?.changed).toBe(true);
  expect(zoomed?.placement.cover).toBe(first.placement.cover);
  expect(zoomed?.placement.scale).not.toBe(first.placement.scale);
});

test('fog brush is deterministic with opaque core and transparent rim', () => {
  const a = fogBrushAlpha(64, 7);
  const b = fogBrushAlpha(64, 7);
  const c = fogBrushAlpha(64, 8);
  expect(a).toEqual(b);
  expect(a).not.toEqual(c);

  const size = 64;
  const alpha = fogBrushAlpha(size, 7);
  const at = (x: number, y: number) => alpha[y * size + x];
  expect(at(size / 2, size / 2)).toBe(255);
  expect(at(0, 0)).toBe(0);
  expect(at(size - 1, size - 1)).toBe(0);
});

test('paintFog lays cloud, erases reveals, scales by strength, and restores context', () => {
  const { ctx, log } = recordingContext();
  paintFog(ctx, paintInput());

  expect(log[0]).toEqual({ op: 'setTransform', args: [2, 0, 0, 2, 200, 200] });
  expect(log.filter((entry) => entry.op === 'fillRect')).toEqual([
    { op: 'fillRect', args: [-100, -100, 600, 400] },
  ]);
  expect(
    log.filter((entry) => entry.op === 'composite').map((entry) => entry.args[0]),
  ).toEqual(['source-over', 'destination-out', 'source-over']);

  const fillIndex = log.findIndex((entry) => entry.op === 'fillRect');
  const eraseIndex = log.findIndex(
    (entry) => entry.op === 'composite' && entry.args[0] === 'destination-out',
  );
  expect(fillIndex).toBeLessThan(eraseIndex);
  // Stamps: 2 discs + stroke chain (length 200, spacing 40 → 6 stamps) + 1 wake.
  expect(log.filter((entry) => entry.op === 'drawImage').length).toBe(2 + 6 + 1);

  const dynamic = recordingContext();
  paintFog(dynamic.ctx, paintInput({ frame: { ...FRAME, strokes: [] }, wakeStamps: [] }));
  const dynamicStamps = dynamic.log.filter((entry) => entry.op === 'drawImage');
  const fullWidth = Number(dynamicStamps[0]?.args[2]);
  const halfWidth = Number(dynamicStamps[1]?.args[2]);
  expect(halfWidth).toBeLessThan(fullWidth);

  const reduced = recordingContext();
  paintFog(
    reduced.ctx,
    paintInput({
      frame: { ...FRAME, strokes: [] },
      wakeStamps: [],
      alphaOnly: true,
    }),
  );
  const reducedStamps = reduced.log.filter((entry) => entry.op === 'drawImage');
  expect(reducedStamps[0]?.args[2]).toBe(reducedStamps[1]?.args[2]);

  const zero = recordingContext();
  paintFog(
    zero.ctx,
    paintInput({
      frame: {
        ...FRAME,
        discs: [{ key: 'd:1', x: 0, y: 0, strength: 0 }],
        strokes: [],
      },
      wakeStamps: [],
    }),
  );
  expect(zero.log.filter((entry) => entry.op === 'drawImage')).toEqual([]);
  expect(zero.ctx.globalCompositeOperation).toBe('source-over');
  expect(zero.ctx.globalAlpha).toBe(1);
});

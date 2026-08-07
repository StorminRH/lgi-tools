import { describe, expect, it } from 'vitest';
import type { FogFrame } from './fog-model';
import {
  decideFogPlacement,
  FOG_MAX_BACKING_PIXELS,
  fogBackingScale,
  fogBrushAlpha,
  fogContentBounds,
  fogCoverContains,
  fogCoverRect,
  mulberry32,
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

// ── Cover and backing decisions ──────────────────────────────────────────────
describe('fog cover math', () => {
  it('bounds every stamp with padding, or null when empty', () => {
    expect(fogContentBounds({ ...FRAME, discs: [], strokes: [] }, 10)).toBeNull();
    expect(fogContentBounds(FRAME, 10)).toEqual({
      x: 90,
      y: 40,
      width: 220,
      height: 20,
    });
  });

  it('covers the visible rect with pan margin and unions content bounds', () => {
    const visible: FogRect = { x: 0, y: 0, width: 100, height: 100 };
    const alone = fogCoverRect(visible, null);
    expect(alone).toEqual({ x: -50, y: -50, width: 200, height: 200 });

    const withContent = fogCoverRect(visible, {
      x: -500,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(withContent.x).toBe(-500);
    expect(withContent.x + withContent.width).toBe(150);
    expect(fogCoverContains(withContent, visible)).toBe(true);
    expect(
      fogCoverContains(alone, { x: 140, y: 0, width: 100, height: 100 }),
    ).toBe(false);
  });

  it('quantizes the backing scale to buckets and degrades to the pixel budget', () => {
    const small: FogRect = { x: 0, y: 0, width: 500, height: 500 };
    expect(fogBackingScale(small, 1, 2)).toBe(2);
    expect(fogBackingScale(small, 0.7, 1)).toBe(1);
    expect(fogBackingScale(small, 2.5, 2)).toBe(4); // bucket ceiling

    const huge: FogRect = { x: 0, y: 0, width: 100_000, height: 100_000 };
    const degraded = fogBackingScale(huge, 2.5, 2);
    expect(degraded).toBeLessThan(1);
    expect(
      huge.width * degraded * (huge.height * degraded),
    ).toBeLessThanOrEqual(FOG_MAX_BACKING_PIXELS * 1.001);
  });
});

describe('decideFogPlacement', () => {
  const viewport = (zoom = 1, width = 1000, height = 800) => ({
    transform: [0, 0, zoom] as const,
    width,
    height,
  });

  it('is null while the pane has no size', () => {
    expect(decideFogPlacement(null, viewport(1, 0, 0), FRAME, 170, 1)).toBeNull();
  });

  it('claims a cover on first paint and keeps it while it still holds', () => {
    const first = decideFogPlacement(null, viewport(), FRAME, 170, 1);
    expect(first?.changed).toBe(true);
    expect(fogCoverContains(first!.placement.cover, { x: 0, y: 0, width: 1000, height: 800 })).toBe(
      true,
    );

    const kept = decideFogPlacement(first!.placement, viewport(), FRAME, 170, 1);
    expect(kept?.changed).toBe(false);
    expect(kept?.placement.cover).toBe(first!.placement.cover);
  });

  it('claims a new cover when the visible rect escapes the old one', () => {
    const first = decideFogPlacement(null, viewport(), FRAME, 170, 1);
    const panned = decideFogPlacement(
      first!.placement,
      { transform: [-5000, 0, 1] as const, width: 1000, height: 800 },
      FRAME,
      170,
      1,
    );
    expect(panned?.changed).toBe(true);
    expect(panned?.placement.cover).not.toBe(first!.placement.cover);
  });

  it('flags a change when only the zoom bucket flips', () => {
    const first = decideFogPlacement(null, viewport(1), FRAME, 170, 1);
    const zoomed = decideFogPlacement(first!.placement, viewport(1.8), FRAME, 170, 1);
    expect(zoomed?.changed).toBe(true);
    expect(zoomed?.placement.cover).toBe(first!.placement.cover);
    expect(zoomed?.placement.scale).not.toBe(first!.placement.scale);
  });
});

// ── Deterministic noise brush ────────────────────────────────────────────────
describe('fog brush', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = fogBrushAlpha(64, 7);
    const b = fogBrushAlpha(64, 7);
    const c = fogBrushAlpha(64, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('is opaque at the core and transparent past the rim', () => {
    const size = 64;
    const alpha = fogBrushAlpha(size, 7);
    const at = (x: number, y: number) => alpha[y * size + x];
    expect(at(size / 2, size / 2)).toBe(255);
    expect(at(0, 0)).toBe(0);
    expect(at(size - 1, size - 1)).toBe(0);
  });

  it('mulberry32 yields a stable [0, 1) stream', () => {
    const first = mulberry32(1234);
    const second = mulberry32(1234);
    for (let i = 0; i < 100; i += 1) {
      const value = first();
      expect(second()).toBe(value);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

// ── Paint command emission against a recording stub ──────────────────────────
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
    // Opaque pass-through to the stub; the real value is the theme token.
    color: 'fog-token',
    opacity: 0.9,
    frame: FRAME,
    wakeStamps: [{ key: 'w:d:1', x: 150, y: 50, strength: 0.5 }],
    revealRadius: 170,
    strokeRadius: 50,
    // A plain size-only stand-in: the painter never reads past width/height.
    brush: { width: 256, height: 256 } as unknown as CanvasImageSource,
    alphaOnly: false,
    ...overrides,
  };
}

describe('paintFog', () => {
  it('lays the cloud once, then erases reveals through destination-out', () => {
    const { ctx, log } = recordingContext();
    paintFog(ctx, paintInput());

    // World transform over the cover rect at the backing scale.
    expect(log[0]).toEqual({ op: 'setTransform', args: [2, 0, 0, 2, 200, 200] });
    const fills = log.filter((entry) => entry.op === 'fillRect');
    expect(fills).toEqual([
      { op: 'fillRect', args: [-100, -100, 600, 400] },
    ]);

    const compositeChanges = log
      .filter((entry) => entry.op === 'composite')
      .map((entry) => entry.args[0]);
    expect(compositeChanges).toEqual([
      'source-over',
      'destination-out',
      'source-over',
    ]);

    // The cloud fill happens before the erase pass.
    const fillIndex = log.findIndex((entry) => entry.op === 'fillRect');
    const eraseIndex = log.findIndex(
      (entry) => entry.op === 'composite' && entry.args[0] === 'destination-out',
    );
    expect(fillIndex).toBeLessThan(eraseIndex);

    // Stamps: 2 discs + stroke chain (length 200, spacing 40 → 6 stamps) + 1 wake.
    const stamps = log.filter((entry) => entry.op === 'drawImage');
    expect(stamps.length).toBe(2 + 6 + 1);
  });

  it('scales the smoke radius with strength, but alpha-only under reduced motion', () => {
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
  });

  it('skips stamps for zero strength and leaves the context restored', () => {
    const { ctx, log } = recordingContext();
    paintFog(
      ctx,
      paintInput({
        frame: {
          ...FRAME,
          discs: [{ key: 'd:1', x: 0, y: 0, strength: 0 }],
          strokes: [],
        },
        wakeStamps: [],
      }),
    );
    expect(log.filter((entry) => entry.op === 'drawImage')).toEqual([]);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.globalAlpha).toBe(1);
  });
});

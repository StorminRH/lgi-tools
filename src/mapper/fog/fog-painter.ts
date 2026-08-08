// The fog canvas's execution math, kept pure and structural so every policy
// here is a unit test rather than a browser observation: cover-rect and
// backing-resolution decisions, the deterministic noise brush, and the paint
// command sequence emitted against a minimal context interface the real
// CanvasRenderingContext2D satisfies structurally.
import { mulberry32 } from '../lib/prng';
import type { FogFrame, FogPaintDisc, FogPaintStroke } from './fog-model';

/** A world-space rectangle. */
export interface FogRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The world margin the cover rect adds beyond the visible rect, as a fraction
 * of the larger visible dimension: pan slack, so ordinary pans stay inside
 * the painted cover until the gesture-end repaint recenters it.
 */
export const FOG_COVER_MARGIN_FRACTION = 0.5;

/**
 * Backing-store pixel budget. Beyond it the backing scale degrades rather
 * than allocating an engine-capped (silently blank) canvas.
 */
export const FOG_MAX_BACKING_PIXELS = 9_000_000;

/** The bounds every stamp must fit inside, padded by the largest brush reach. */
export function fogContentBounds(frame: FogFrame, pad: number): FogRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const disc of frame.discs) grow(disc.x, disc.y);
  for (const stroke of frame.strokes) {
    grow(stroke.x1, stroke.y1);
    grow(stroke.x2, stroke.y2);
  }
  if (minX === Infinity) return null;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/** The union of two world rects. */
function unionRect(a: FogRect, b: FogRect): FogRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * The cover rect one paint claims: the visible world rect grown by the pan
 * margin, unioned with the content bounds so no reveal can ever be clipped by
 * the canvas edge.
 */
export function fogCoverRect(visible: FogRect, content: FogRect | null): FogRect {
  const margin =
    Math.max(visible.width, visible.height) * FOG_COVER_MARGIN_FRACTION;
  const grown: FogRect = {
    x: visible.x - margin,
    y: visible.y - margin,
    width: visible.width + margin * 2,
    height: visible.height + margin * 2,
  };
  return content === null ? grown : unionRect(grown, content);
}

/** Whether the current cover still contains the whole visible rect. */
export function fogCoverContains(cover: FogRect, visible: FogRect): boolean {
  return (
    visible.x >= cover.x &&
    visible.y >= cover.y &&
    visible.x + visible.width <= cover.x + cover.width &&
    visible.y + visible.height <= cover.y + cover.height
  );
}

/**
 * Backing texels per world unit: the zoom×dpr demand quantized to power-of-two
 * buckets (so the backing store reallocates a handful of times across a zoom
 * session, never continuously), then degraded to fit the pixel budget. Fog is
 * soft by nature, so degraded resolution reads as more smoke, not as damage.
 */
export function fogBackingScale(
  cover: FogRect,
  zoom: number,
  devicePixelRatio: number,
  maxPixels = FOG_MAX_BACKING_PIXELS,
): number {
  const demand = Math.max(0.05, zoom * devicePixelRatio);
  const bucket = Math.min(4, 2 ** Math.ceil(Math.log2(demand)));
  const area = Math.max(1, cover.width * cover.height);
  const budgetCap = Math.sqrt(maxPixels / area);
  return Math.max(0.02, Math.min(bucket, budgetCap));
}

/** Noise lattice cells across the brush — coarse, so the fringe reads smoky. */
const BRUSH_NOISE_CELLS = 8;

/** Hermite smoothstep on [0, 1]. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value-noise sample from a lattice, in [0, 1]. */
function latticeNoise(lattice: readonly number[], u: number, v: number): number {
  const x = u * (BRUSH_NOISE_CELLS - 1);
  const y = v * (BRUSH_NOISE_CELLS - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(BRUSH_NOISE_CELLS - 1, x0 + 1);
  const y1 = Math.min(BRUSH_NOISE_CELLS - 1, y0 + 1);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  // Indices are clamped to the lattice bounds above, so the cell exists.
  const at = (cx: number, cy: number) => lattice[cy * BRUSH_NOISE_CELLS + cx]!;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return top + (bottom - top) * fy;
}

/**
 * The soft noise-brushed reveal sprite as an alpha map (row-major, one byte
 * per texel): an opaque core easing to nothing at the rim, with the noise
 * biting only in the fringe band so unioned stamps produce organic smoky
 * boundaries instead of clean circles. Deterministic for a given seed — every
 * client renders the identical cloud.
 */
export function fogBrushAlpha(size: number, seed: number): Uint8ClampedArray {
  const random = mulberry32(seed);
  const lattice = Array.from(
    { length: BRUSH_NOISE_CELLS * BRUSH_NOISE_CELLS },
    () => random(),
  );
  const alpha = new Uint8ClampedArray(size * size);
  const half = size / 2;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const r = Math.hypot(px + 0.5 - half, py + 0.5 - half) / half;
      if (r >= 1) continue;
      // Solid inside 0.55, easing to 0 at the rim.
      const falloff = r <= 0.55 ? 1 : 1 - smooth((r - 0.55) / 0.45);
      // The noise band straddles the fringe and leaves the core untouched.
      const band = Math.max(0, 1 - Math.abs(r - 0.75) / 0.35);
      const noise = latticeNoise(lattice, px / size, py / size);
      const value = falloff + (noise - 0.5) * 0.7 * band;
      alpha[py * size + px] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
  }
  return alpha;
}

/** One claimed cover rect and backing scale. */
export interface FogPlacement {
  readonly cover: FogRect;
  readonly scale: number;
}

/** What one placement decision reads from the React Flow store. */
export interface FogViewportState {
  readonly transform: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
}

/**
 * The per-paint placement decision: keep the previous cover while it still
 * contains both the visible rect and the content bounds and the zoom's
 * backing bucket is unchanged; otherwise claim a new cover. `changed` tells
 * the host to resize/reposition the canvas. `null` while the pane has no
 * size yet.
 */
export function decideFogPlacement(
  previous: FogPlacement | null,
  viewport: FogViewportState,
  frame: FogFrame,
  revealRadius: number,
  devicePixelRatio: number,
): { readonly placement: FogPlacement; readonly changed: boolean } | null {
  if (viewport.width === 0 || viewport.height === 0) return null;
  const [x, y, zoom] = viewport.transform;
  const visible: FogRect = {
    x: -x / zoom,
    y: -y / zoom,
    width: viewport.width / zoom,
    height: viewport.height / zoom,
  };
  const content = fogContentBounds(frame, revealRadius * 1.5);
  const keepCover =
    previous !== null &&
    fogCoverContains(previous.cover, visible) &&
    (content === null || fogCoverContains(previous.cover, content));
  const cover = keepCover ? previous.cover : fogCoverRect(visible, content);
  const scale = fogBackingScale(cover, zoom, Math.max(devicePixelRatio, 1));
  const changed =
    previous === null || cover !== previous.cover || scale !== previous.scale;
  return { placement: { cover, scale }, changed };
}

/**
 * The command surface the painter emits against. The real 2D context
 * satisfies it structurally; tests drive a recording stub.
 */
export interface FogPaintContext {
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  drawImage(
    image: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

/** Everything one paint consumes. */
export interface FogPaintInput {
  readonly cover: FogRect;
  /** Backing texels per world unit (from `fogBackingScale`). */
  readonly scale: number;
  /** Resolved fog color (token-derived; never a call-site literal). */
  readonly color: string;
  /** Cloud density in [0, 1]. */
  readonly opacity: number;
  readonly frame: FogFrame;
  readonly wakeStamps: readonly FogPaintDisc[];
  readonly revealRadius: number;
  readonly strokeRadius: number;
  readonly brush: CanvasImageSource;
  /** Reduced motion: strength drives alpha only, never the smoke radius. */
  readonly alphaOnly: boolean;
}

/** Stable per-stamp rotation so the noise fringe varies without flicker. */
function stampAngle(key: string, index: number): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }
  return (((hash + index * 97) % 360) * Math.PI) / 180;
}

/** One brush stamp: rotated, centered, alpha-scaled erase. */
function stampBrush(
  ctx: FogPaintContext,
  input: Pick<FogPaintInput, 'brush'>,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  angle: number,
): void {
  if (alpha <= 0 || radius <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(input.brush, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

/** A disc reveal's radius and alpha for its current strength. */
function discPresentation(
  strength: number,
  radius: number,
  alphaOnly: boolean,
): { readonly radius: number; readonly alpha: number } {
  if (alphaOnly) return { radius, alpha: strength };
  return { radius: radius * (0.55 + 0.45 * strength), alpha: strength };
}

/** Stamps one corridor reveal as brush stamps along the segment. */
function stampStroke(
  ctx: FogPaintContext,
  input: FogPaintInput,
  stroke: FogPaintStroke,
): void {
  const { radius, alpha } = discPresentation(
    stroke.strength,
    input.strokeRadius,
    input.alphaOnly,
  );
  const length = Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1);
  const spacing = input.strokeRadius * 0.8;
  const count = Math.max(1, Math.ceil(length / spacing));
  for (let step = 0; step <= count; step += 1) {
    const t = step / count;
    stampBrush(
      ctx,
      input,
      stroke.x1 + (stroke.x2 - stroke.x1) * t,
      stroke.y1 + (stroke.y2 - stroke.y1) * t,
      radius,
      alpha,
      stampAngle(stroke.key, step),
    );
  }
}

/**
 * Paints one settled fog frame: transform into world units over the cover
 * rect, lay the cloud, then erase the union reveals (discs, corridors, wake)
 * through the noise brush with `destination-out`. Exactly one cloud fill per
 * call — the caller owns scheduling (at most once per animation frame).
 */
export function paintFog(ctx: FogPaintContext, input: FogPaintInput): void {
  const { cover, scale } = input;
  ctx.setTransform(scale, 0, 0, scale, -cover.x * scale, -cover.y * scale);
  ctx.clearRect(cover.x, cover.y, cover.width, cover.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = input.opacity;
  ctx.fillStyle = input.color;
  ctx.fillRect(cover.x, cover.y, cover.width, cover.height);

  ctx.globalCompositeOperation = 'destination-out';
  for (const disc of input.frame.discs) {
    const { radius, alpha } = discPresentation(
      disc.strength,
      input.revealRadius,
      input.alphaOnly,
    );
    stampBrush(ctx, input, disc.x, disc.y, radius, alpha, stampAngle(disc.key, 0));
  }
  for (const stroke of input.frame.strokes) stampStroke(ctx, input, stroke);
  for (const wake of input.wakeStamps) {
    stampBrush(
      ctx,
      input,
      wake.x,
      wake.y,
      input.strokeRadius,
      wake.strength * 0.7,
      stampAngle(wake.key, 0),
    );
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

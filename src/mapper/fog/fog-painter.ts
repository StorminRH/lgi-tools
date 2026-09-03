import { mulberry32 } from '../lib/prng';
import type { FogFrame, FogPaintDisc, FogPaintStroke } from './fog-model';

export interface FogRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const FOG_COVER_MARGIN_FRACTION = 0.5;

export const FOG_MAX_BACKING_PIXELS = 9_000_000;

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

export function fogCoverContains(cover: FogRect, visible: FogRect): boolean {
  return (
    visible.x >= cover.x &&
    visible.y >= cover.y &&
    visible.x + visible.width <= cover.x + cover.width &&
    visible.y + visible.height <= cover.y + cover.height
  );
}

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

const BRUSH_NOISE_CELLS = 8;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function latticeNoise(lattice: readonly number[], u: number, v: number): number {
  const x = u * (BRUSH_NOISE_CELLS - 1);
  const y = v * (BRUSH_NOISE_CELLS - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(BRUSH_NOISE_CELLS - 1, x0 + 1);
  const y1 = Math.min(BRUSH_NOISE_CELLS - 1, y0 + 1);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);

  const at = (cx: number, cy: number) => lattice[cy * BRUSH_NOISE_CELLS + cx]!;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return top + (bottom - top) * fy;
}

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

      const falloff = r <= 0.55 ? 1 : 1 - smooth((r - 0.55) / 0.45);

      const band = Math.max(0, 1 - Math.abs(r - 0.75) / 0.35);
      const noise = latticeNoise(lattice, px / size, py / size);
      const value = falloff + (noise - 0.5) * 0.7 * band;
      alpha[py * size + px] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
  }
  return alpha;
}

export interface FogPlacement {
  readonly cover: FogRect;
  readonly scale: number;
}

export interface FogViewportState {
  readonly transform: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
}

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

export interface FogPaintInput {
  readonly cover: FogRect;

  readonly scale: number;

  readonly color: string;

  readonly opacity: number;
  readonly frame: FogFrame;
  readonly wakeStamps: readonly FogPaintDisc[];
  readonly revealRadius: number;
  readonly strokeRadius: number;
  readonly brush: CanvasImageSource;

  readonly alphaOnly: boolean;
}

function stampAngle(key: string, index: number): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }
  return (((hash + index * 97) % 360) * Math.PI) / 180;
}

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

function discPresentation(
  strength: number,
  radius: number,
  alphaOnly: boolean,
): { readonly radius: number; readonly alpha: number } {
  if (alphaOnly) return { radius, alpha: strength };
  return { radius: radius * (0.55 + 0.45 * strength), alpha: strength };
}

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

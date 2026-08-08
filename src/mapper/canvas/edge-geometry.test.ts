import { describe, expect, it } from 'vitest';
import {
  chainLinkFogPath,
  chainLinkPath,
  endpointFrame,
  frameCenter,
  frameSegment,
  pointAlongChainLink,
  type FrameRect,
} from './edge-geometry';

const frame = (x: number, y: number, width = 120, height = 88): FrameRect => ({
  x,
  y,
  width,
  height,
});

// ── OW1 — connection lines clip to each endpoint's frame boundary ────────────
describe('frame-clip edge geometry', () => {
  it('clips a horizontal segment to both frames, aimed through the centers', () => {
    // Centers (60, 44) and (360, 44); each frame claims 60px of the 300px run.
    expect(frameSegment(frame(0, 0), frame(300, 0))).toEqual({
      startX: 120,
      startY: 44,
      endX: 300,
      endY: 44,
    });
  });

  it('clips a vertical segment on the top and bottom frame edges', () => {
    // Centers (60, 44) and (60, 244); each frame claims 44px of the 200px run.
    expect(frameSegment(frame(0, 0), frame(0, 200))).toEqual({
      startX: 60,
      startY: 88,
      endX: 60,
      endY: 200,
    });
  });

  it('exits through the nearer boundary axis on a diagonal', () => {
    // 100×100 frames, centers (50, 50) → (250, 150): dx dominates, so the
    // segment leaves through the source's right edge and enters the target's
    // left edge, staying aimed through both centers.
    expect(frameSegment(frame(0, 0, 100, 100), frame(200, 100, 100, 100))).toEqual({
      startX: 100,
      startY: 75,
      endX: 200,
      endY: 125,
    });
  });

  it('respects each endpoint frame size independently', () => {
    // Source 120×88, target 40×40: centers (60, 44) → (320, 44).
    expect(frameSegment(frame(0, 0), frame(300, 24, 40, 40))).toEqual({
      startX: 120,
      startY: 44,
      endX: 300,
      endY: 44,
    });
  });

  it('returns null for touching or overlapping frames — no visible segment remains', () => {
    // Centers 100px apart; each frame claims 60px of the run.
    expect(frameSegment(frame(0, 0), frame(100, 0))).toBeNull();
    expect(frameSegment(frame(0, 0), frame(30, 10))).toBeNull();
    expect(frameSegment(frame(0, 0), frame(0, 0))).toBeNull();
  });

  it('centers a frame box', () => {
    expect(frameCenter(frame(10, 20))).toEqual({ x: 70, y: 64 });
  });
});

describe('chain link path policy', () => {
  const node = (
    x: number,
    y: number,
    dims: {
      readonly measured?: { readonly width?: number; readonly height?: number };
      readonly width?: number;
      readonly height?: number;
    } = {},
  ) => ({
    internals: { positionAbsolute: { x, y } },
    measured: dims.measured ?? {},
    width: dims.width,
    height: dims.height,
  });

  const MEASURED = { measured: { width: 120, height: 88 } };

  it('builds the frame-clipped path between two measured nodes', () => {
    expect(chainLinkPath(node(0, 0, MEASURED), node(300, 0, MEASURED))).toBe(
      'M 120,44 L 300,44',
    );
  });

  it('draws from declared frame dimensions before measurement lands', () => {
    const declared = { width: 120, height: 88 };
    expect(chainLinkPath(node(0, 0, declared), node(300, 0, declared))).toBe(
      'M 120,44 L 300,44',
    );
  });

  it('prefers measured dimensions over declared ones', () => {
    const both = { measured: { width: 40, height: 40 }, width: 120, height: 88 };
    expect(endpointFrame(node(0, 0, both))).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    });
  });

  it.each([
    ['missing source', undefined, node(300, 0, MEASURED)],
    ['missing target', node(0, 0, MEASURED), undefined],
    ['dimensionless source', node(0, 0), node(300, 0, MEASURED)],
    ['dimensionless target', node(0, 0, MEASURED), node(300, 0)],
  ])('returns null for a %s', (_case, source, target) => {
    expect(chainLinkPath(source, target)).toBeNull();
  });

  it('returns null when the frames touch and no segment remains', () => {
    expect(chainLinkPath(node(0, 0, MEASURED), node(100, 0, MEASURED))).toBeNull();
  });
});

// ── OW1 — the parametric mount seam for edge-riding widgets ──────────────────
describe('point along chain link', () => {
  it('walks the clipped segment from source boundary to target boundary', () => {
    const source = frame(0, 0);
    const target = frame(300, 0);
    expect(pointAlongChainLink(source, target, 0)).toEqual({
      x: 120,
      y: 44,
      angle: 0,
    });
    expect(pointAlongChainLink(source, target, 1)).toEqual({
      x: 300,
      y: 44,
      angle: 0,
    });
    expect(pointAlongChainLink(source, target, 0.5)).toEqual({
      x: 210,
      y: 44,
      angle: 0,
    });
  });

  it('reports the heading in CSS-rotation degrees, source toward target', () => {
    expect(pointAlongChainLink(frame(0, 0), frame(0, 200), 0.5)?.angle).toBe(90);
    expect(pointAlongChainLink(frame(0, 200), frame(0, 0), 0.5)?.angle).toBe(-90);
    expect(pointAlongChainLink(frame(300, 0), frame(0, 0), 0.5)?.angle).toBe(180);
  });

  it('is null when no visible segment exists between the frames', () => {
    expect(pointAlongChainLink(frame(0, 0), frame(100, 0), 0.5)).toBeNull();
  });
});

// ── OW4 — the fogged-endpoint cutoff stub ────────────────────────────────────
describe('chain link fog path', () => {
  const node = (x: number, y: number) => ({
    internals: { positionAbsolute: { x, y } },
    measured: { width: 120, height: 88 },
  });

  it('keeps the drawn-side stub toward a fogged target', () => {
    // Full clipped segment runs x 120 → 300; half the cut keeps 120 → 210.
    expect(chainLinkFogPath(node(0, 0), node(300, 0), 'target', 0.5)).toBe(
      'M 120,44 L 210,44',
    );
  });

  it('keeps the drawn-side stub toward a fogged source', () => {
    expect(chainLinkFogPath(node(0, 0), node(300, 0), 'source', 0.5)).toBe(
      'M 210,44 L 300,44',
    );
  });

  it('is null exactly when the full path would be', () => {
    expect(chainLinkFogPath(undefined, node(300, 0), 'target', 0.5)).toBeNull();
    expect(chainLinkFogPath(node(0, 0), node(100, 0), 'target', 0.5)).toBeNull();
  });
});

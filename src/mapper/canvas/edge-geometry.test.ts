import { describe, expect, it } from 'vitest';
import { chainLinkPath, rimSegment } from './edge-geometry';

describe('rim-clip edge geometry', () => {
  it('clips a horizontal segment to both rims, aimed through the centers', () => {
    const segment = rimSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 22);
    expect(segment).toEqual({ startX: 22, startY: 0, endX: 78, endY: 0 });
  });

  it('clips a diagonal segment symmetrically', () => {
    const segment = rimSegment({ x: 0, y: 0 }, { x: 30, y: 40 }, 10);
    // Unit vector (0.6, 0.8) over length 50.
    expect(segment).toEqual({ startX: 6, startY: 8, endX: 24, endY: 32 });
  });

  it('returns null for touching discs — no visible segment remains', () => {
    expect(rimSegment({ x: 0, y: 0 }, { x: 44, y: 0 }, 22)).toBeNull();
  });

  it('returns null for overlapping discs', () => {
    expect(rimSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 22)).toBeNull();
  });
});

describe('chain link path policy', () => {
  const node = (x: number, y: number, width?: number) => ({
    internals: { positionAbsolute: { x, y } },
    measured: { width },
  });

  it('builds the rim-clipped path between two measured nodes', () => {
    // Centers: (50, 22) and (150, 22) with radius 22 → clipped by 22 on each end.
    expect(chainLinkPath(node(0, 0, 100), node(100, 0, 100), 22)).toBe(
      'M 72,22 L 128,22',
    );
  });

  it.each([
    ['missing source', undefined, node(100, 0, 100)],
    ['missing target', node(0, 0, 100), undefined],
    ['unmeasured source', node(0, 0), node(100, 0, 100)],
    ['unmeasured target', node(0, 0, 100), node(100, 0)],
  ])('returns null for a %s', (_case, source, target) => {
    expect(chainLinkPath(source, target, 22)).toBeNull();
  });

  it('returns null when the discs touch and no segment remains', () => {
    expect(chainLinkPath(node(0, 0, 44), node(30, 0, 44), 22)).toBeNull();
  });
});

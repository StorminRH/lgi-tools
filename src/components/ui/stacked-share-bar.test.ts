import { describe, expect, it } from 'vitest';
import { stackedShareLayout } from './stacked-share-bar';

describe('stackedShareLayout', () => {
  it('lays segments end-to-end across the width with cumulative x and share %', () => {
    const parts = stackedShareLayout(
      [
        { label: 'New', value: 30, tone: 'blue' },
        { label: 'Returning', value: 70, tone: 'purple' },
      ],
      200,
    );
    expect(parts[0]).toMatchObject({ x: 0, w: 60, pct: 30, labelX: 0, labelAnchor: 'start' });
    expect(parts[1]).toMatchObject({ x: 60, w: 140, pct: 70, labelX: 200, labelAnchor: 'end' });
  });

  it('returns nothing when the total is zero', () => {
    expect(stackedShareLayout([{ label: 'a', value: 0, tone: 'blue' }], 200)).toEqual([]);
  });
});

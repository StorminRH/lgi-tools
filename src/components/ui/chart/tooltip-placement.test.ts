import { describe, expect, it } from 'vitest';
import { placeTooltip } from './tooltip-placement';

const box = { width: 120, height: 60 };
const bounds = { width: 500, height: 200 };

describe('placeTooltip', () => {
  it('centres the box above the point when it fits', () => {
    expect(placeTooltip({ x: 250, y: 150 }, box, bounds)).toEqual({ x: 190, y: 80 });
  });

  it('flips to the left of the crosshair at the right edge', () => {
    expect(placeTooltip({ x: 495, y: 120 }, box, bounds)).toEqual({ x: 365, y: 90 });
  });

  it('sits right of the crosshair at the left edge', () => {
    expect(placeTooltip({ x: 5, y: 120 }, box, bounds)).toEqual({ x: 15, y: 90 });
  });

  it('clamps down when the point is near the top', () => {
    expect(placeTooltip({ x: 250, y: 20 }, box, bounds)).toEqual({ x: 190, y: 0 });
    expect(placeTooltip({ x: 495, y: 5 }, box, bounds)).toEqual({ x: 365, y: 0 });
  });

  it('clamps up near the bottom and stays inside a chart smaller than the box', () => {
    expect(placeTooltip({ x: 495, y: 199 }, box, bounds)).toEqual({ x: 365, y: 140 });
    expect(placeTooltip({ x: 50, y: 50 }, { width: 600, height: 60 }, bounds)).toEqual({ x: 0, y: 20 });
  });
});

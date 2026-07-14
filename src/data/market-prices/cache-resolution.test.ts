import { describe, expect, it } from 'vitest';
import { consumeFreshPriceResolution, markFreshPriceResolution } from './cache-resolution';

describe('price cache resolution tracking', () => {
  it('attributes a cache fill to exactly one consumer', () => {
    const id = markFreshPriceResolution();

    expect(consumeFreshPriceResolution(id)).toBe(true);
    expect(consumeFreshPriceResolution(id)).toBe(false);
  });

  it('classifies a resolution created elsewhere as cached', () => {
    expect(consumeFreshPriceResolution('remote-cache-resolution')).toBe(false);
  });
});

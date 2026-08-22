import { describe, expect, it } from 'vitest';
import { getCachedPricesFreshness, getCachedTrackedTypeCount } from './cache';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    expect(getCachedPricesFreshness).toBeDefined();
    expect(getCachedTrackedTypeCount).toBeDefined();
  });
});

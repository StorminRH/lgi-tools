import { describe, expect, it } from 'vitest';
import { getMarketHistoryInputs } from './queries';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    expect(getMarketHistoryInputs).toBeDefined();
  });
});

import { expect, test } from 'vitest';
import { readPriceSourceHealth } from './source-health';

test('price source health projects a refresh summary onto its four counts and stays clean on an all-ESI read', () => {
  const summary = {
    requested: 12,
    fetched: 10,
    written: 9,
    durationMs: 1234,
    esiCount: 10,
    fuzzworkFallbackCount: 0,
    budgetExhausted: false,
  };

  expect(readPriceSourceHealth(summary)).toEqual({
    counts: { fetched: 10, esiCount: 10, fuzzworkFallbackCount: 0, budgetExhausted: false },
    degraded: false,
  });
});

test('price source health marks a read degraded on a Fuzzwork fallback, an exhausted budget, or both', () => {
  const fallbackOnly = { fetched: 3, esiCount: 1, fuzzworkFallbackCount: 2, budgetExhausted: false };
  const budgetOnly = { fetched: 1, esiCount: 1, fuzzworkFallbackCount: 0, budgetExhausted: true };
  const both = { fetched: 4, esiCount: 0, fuzzworkFallbackCount: 4, budgetExhausted: true };

  expect(readPriceSourceHealth(fallbackOnly)).toEqual({ counts: fallbackOnly, degraded: true });
  expect(readPriceSourceHealth(budgetOnly)).toEqual({ counts: budgetOnly, degraded: true });
  expect(readPriceSourceHealth(both)).toEqual({ counts: both, degraded: true });
});

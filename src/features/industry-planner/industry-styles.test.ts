import { describe, expect, it } from 'vitest';
import {
  aggregateConfidence,
  priceConfidence,
  type ConfidenceInput,
} from './industry-styles';

// Fixed clock so freshness is deterministic.
const NOW = 1_700_000_000_000;
const FRESH = NOW + 60_000;
const STALE = NOW - 60_000;

// A fully-trustworthy row: fresh ESI price with real depth.
function liveRow(over: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return { source: 'esi', buyVolume: 5_000, unitBuy: 10, staleAfterMs: FRESH, ...over };
}

describe('priceConfidence', () => {
  it('is high for a fresh ESI price with real depth', () => {
    const c = priceConfidence(liveRow(), NOW);
    expect(c.level).toBe('high');
    expect(c.reasons).toEqual([]);
  });

  it('is unknown when there is no price row at all', () => {
    expect(priceConfidence(liveRow({ staleAfterMs: null }), NOW).level).toBe('unknown');
  });

  it('is low when priced row has no usable buy price', () => {
    const c = priceConfidence(liveRow({ unitBuy: null }), NOW);
    expect(c.level).toBe('low');
    expect(c.reasons[0]).toMatch(/no live price/i);
  });

  it('is medium when stale', () => {
    const c = priceConfidence(liveRow({ staleAfterMs: STALE }), NOW);
    expect(c.level).toBe('medium');
    expect(c.reasons).toContain('Stale — price may have moved');
  });

  it('is medium when the source is the fallback, not ESI', () => {
    const c = priceConfidence(liveRow({ source: 'fuzzwork-fallback' }), NOW);
    expect(c.level).toBe('medium');
    expect(c.reasons).toContain('Fallback price source');
  });

  it('is medium when buy-side depth is thin', () => {
    const c = priceConfidence(liveRow({ buyVolume: 10 }), NOW);
    expect(c.level).toBe('medium');
    expect(c.reasons).toContain('Thin market depth');
  });

  it('accumulates every shortfall into reasons', () => {
    const c = priceConfidence(
      liveRow({ staleAfterMs: STALE, source: 'fuzzwork-fallback', buyVolume: 1 }),
      NOW,
    );
    expect(c.level).toBe('medium');
    expect(c.reasons).toHaveLength(3);
  });
});

describe('aggregateConfidence', () => {
  it('is unknown with no rows', () => {
    expect(aggregateConfidence([], NOW)).toEqual({
      level: 'unknown',
      summary: 'No materials to price',
    });
  });

  it('is high and clean when every row is trustworthy', () => {
    const rows = Array.from({ length: 5 }, () => liveRow());
    expect(aggregateConfidence(rows, NOW)).toEqual({
      level: 'high',
      summary: 'all live · liquid',
    });
  });

  it('stays high with a small share of problems, surfacing the counts', () => {
    // 8 of 10 fully trustworthy (≥75%) → headline stays high, exceptions listed.
    const rows = [
      ...Array.from({ length: 8 }, () => liveRow()),
      liveRow({ staleAfterMs: STALE }),
      liveRow({ unitBuy: null }),
    ];
    expect(aggregateConfidence(rows, NOW)).toEqual({
      level: 'high',
      summary: '1 stale · 1 missing',
    });
  });

  it('drops to low when most rows are missing', () => {
    const rows = [
      liveRow(),
      liveRow({ staleAfterMs: null }),
      liveRow({ staleAfterMs: null }),
      liveRow({ unitBuy: null }),
      liveRow({ unitBuy: null }),
    ];
    const agg = aggregateConfidence(rows, NOW);
    expect(agg.level).toBe('low');
    expect(agg.summary).toBe('4 missing');
  });
});

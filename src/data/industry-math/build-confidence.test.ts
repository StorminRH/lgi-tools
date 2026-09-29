import { describe, expect, it } from 'vitest';
import { buildConfidence, CONFIDENCE_WEIGHTS, confidenceBand, FACTOR_FLOOR, trendScore } from './build-confidence';
import { computeMarketScore, type MarketScoreInputs } from './market-score';

const SOLID: MarketScoreInputs = {
  outputUnits: 10,
  adv: 1_000,
  sellWallUnits: 0,
  instantDumpUnits: 100,
  priceVolatility: 0,
  volumeCv: 0,
};

describe('buildConfidence', () => {
  it('scores a full house at 100 with nothing lost', () => {
    const c = buildConfidence({ market: computeMarketScore(SOLID), probProfit: 1, momentum: 0, tradedDays: 30, windowDays: 30 });
    expect(c.score).toBe(100);
    expect(c.factors.reduce((sum, f) => sum + f.penalty, 0)).toBeLessThan(0.5);
  });

  it('names no weakest factor when nothing is lost', () => {
    const market = computeMarketScore({ ...SOLID, adv: null });
    const c = buildConfidence({ market, probProfit: 1, momentum: 0, tradedDays: 30, windowDays: 30 });
    expect(c.score).toBe(100);
    expect(c.factors.every((f) => f.penalty === 0)).toBe(true);
    expect(c.weakest).toBeNull();
  });

  it('splits the lost points across the factors, and they add up', () => {
    const market = computeMarketScore({ ...SOLID, priceVolatility: 0.15, volumeCv: 0.75 });
    const c = buildConfidence({ market, probProfit: 0.6, momentum: -0.01, tradedDays: 27, windowDays: 30 });
    const lost = c.factors.reduce((sum, f) => sum + f.penalty, 0);
    expect(c.score).not.toBeNull();
    expect(lost).toBeCloseTo(100 - (c.score ?? 0), 0);
    expect(c.weakest).toBe('profitOdds');
    expect(c.factors.reduce((sum, f) => sum + f.share, 0)).toBeCloseTo(1, 9);
  });

  it('reweights across the known factors when the cost is missing', () => {
    const c = buildConfidence({ market: computeMarketScore(SOLID), probProfit: null, momentum: 0.05, tradedDays: 15, windowDays: 30 });
    const odds = c.factors.find((f) => f.id === 'profitOdds');
    expect(odds).toMatchObject({ score: null, share: 0, penalty: 0 });
    const history = c.factors.find((f) => f.id === 'history');
    expect(history?.share).toBeCloseTo(CONFIDENCE_WEIGHTS.history / (1 - CONFIDENCE_WEIGHTS.profitOdds), 9);
    expect(c.weakest).toBe('history');
  });

  it('drops hard when one factor is zero, blaming that factor', () => {
    const c = buildConfidence({ market: computeMarketScore(SOLID), probProfit: 0, momentum: 0, tradedDays: 30, windowDays: 30 });
    expect(c.score).toBe(Math.round(100 * FACTOR_FLOOR ** CONFIDENCE_WEIGHTS.profitOdds));
    expect(c.weakest).toBe('profitOdds');
  });

  it('is unknown with nothing to read', () => {
    const market = computeMarketScore({ ...SOLID, adv: null, priceVolatility: null, volumeCv: null });
    const c = buildConfidence({ market, probProfit: null, momentum: null, tradedDays: null, windowDays: 30 });
    expect(c.score).toBeNull();
    expect(c.weakest).toBeNull();
    expect(buildConfidence({ market, probProfit: null, momentum: null, tradedDays: 3, windowDays: 0 }).score).toBeNull();
  });
});

describe('trendScore', () => {
  it('costs nothing for a flat or rising price and scales a slide', () => {
    expect(trendScore(null)).toBeNull();
    expect(trendScore(0.08)).toBe(1);
    expect(trendScore(0)).toBe(1);
    expect(trendScore(-0.0625)).toBeCloseTo(0.5, 9);
    expect(trendScore(-0.5)).toBe(0);
  });
});

describe('confidenceBand', () => {
  it('bands the score', () => {
    expect(confidenceBand(null)).toBeNull();
    expect(confidenceBand(82)).toBe('high');
    expect(confidenceBand(60)).toBe('medium');
    expect(confidenceBand(40)).toBe('low');
    expect(confidenceBand(20)).toBe('avoid');
  });
});

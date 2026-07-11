import { describe, expect, it } from 'vitest';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import type { DepthBand } from '@/data/market-prices/types';
import type { MarketScore } from '@/data/industry-math/market-score';
import {
  daysSinceHistoryDate,
  INSTANT_DUMP_BAND_PCT,
  marketScoreView,
  SCORE_ADV_WINDOW_DAYS,
  SELL_WALL_BAND_PCT,
  signalValues,
  STALENESS_FLAG_DAYS,
  toMarketScoreInputs,
} from './market-score-inputs';

const HISTORY: MarketHistoryInputs = {
  typeId: 1,
  averageDailyVolume: [
    { days: 7, adv: 9_000 },
    { days: 30, adv: 8_000 },
    { days: 90, adv: 7_000 },
  ],
  volumeCv: 0.3,
  priceVolatility: 0.12,
  daysCovered: 30,
  latestDate: '2026-06-13',
};

// A full 5-band ladder [0.5,1,2,5,10]% with rising cumulative volume.
const LADDER: DepthBand[] = [
  { pct: 0.5, cumVolume: 100 },
  { pct: 1, cumVolume: 250 },
  { pct: 2, cumVolume: 600 },
  { pct: 5, cumVolume: 1_500 },
  { pct: 10, cumVolume: 4_000 },
];

describe('toMarketScoreInputs', () => {
  it('anchors the score on the 30-day ADV window', () => {
    const i = toMarketScoreInputs({ outputUnits: 100, history: HISTORY, buyDepth: null, sellDepth: null });
    expect(SCORE_ADV_WINDOW_DAYS).toBe(30);
    expect(i.adv).toBe(8_000); // the 30d window, not 7d or 90d
  });

  it('reads the sell-wall from the sell-side band and instant-dump from the buy-side band', () => {
    const i = toMarketScoreInputs({
      outputUnits: 100,
      history: HISTORY,
      buyDepth: LADDER,
      sellDepth: LADDER,
    });
    expect(i.sellWallUnits).toBe(LADDER.find((b) => b.pct === SELL_WALL_BAND_PCT)!.cumVolume); // 1500
    expect(i.instantDumpUnits).toBe(LADDER.find((b) => b.pct === INSTANT_DUMP_BAND_PCT)!.cumVolume); // 600
  });

  it('passes through volatility and volume CV', () => {
    const i = toMarketScoreInputs({ outputUnits: 100, history: HISTORY, buyDepth: null, sellDepth: null });
    expect(i.priceVolatility).toBe(0.12);
    expect(i.volumeCv).toBe(0.3);
    expect(i.outputUnits).toBe(100);
  });

  it('returns null inputs when history and depth are absent (honest unknowns)', () => {
    const i = toMarketScoreInputs({ outputUnits: 100, history: null, buyDepth: null, sellDepth: null });
    expect(i).toMatchObject({
      adv: null,
      sellWallUnits: null,
      instantDumpUnits: null,
      priceVolatility: null,
      volumeCv: null,
    });
  });

  it('returns null for a missing window or a missing band', () => {
    const thinHistory: MarketHistoryInputs = {
      ...HISTORY,
      averageDailyVolume: [{ days: 7, adv: 9_000 }], // no 30d window
    };
    const shortLadder: DepthBand[] = [{ pct: 0.5, cumVolume: 100 }]; // no 5%/2% band
    const i = toMarketScoreInputs({
      outputUnits: 100,
      history: thinHistory,
      buyDepth: shortLadder,
      sellDepth: shortLadder,
    });
    expect(i.adv).toBeNull();
    expect(i.sellWallUnits).toBeNull();
    expect(i.instantDumpUnits).toBeNull();
  });
});

describe('daysSinceHistoryDate / STALENESS_FLAG_DAYS', () => {
  // Fixed client clock at noon UTC so the day floor lands on 2026-06-14 cleanly.
  const NOW = Date.parse('2026-06-14T12:00:00Z');

  it('is null when the latest trade date is absent (honest unknown)', () => {
    expect(daysSinceHistoryDate(null, NOW)).toBeNull();
  });

  it('is null (never NaN) for a malformed date string — honours its number | null contract', () => {
    expect(daysSinceHistoryDate('', NOW)).toBeNull();
    expect(daysSinceHistoryDate('not-a-date', NOW)).toBeNull();
  });

  it('is 0 for a trade earlier the same UTC day', () => {
    expect(daysSinceHistoryDate('2026-06-14', NOW)).toBe(0);
  });

  it('counts whole UTC days back to the latest trade', () => {
    expect(daysSinceHistoryDate('2026-06-13', NOW)).toBe(1); // fresh: ended yesterday
    expect(daysSinceHistoryDate('2026-05-31', NOW)).toBe(14); // exactly the threshold
  });

  it('grows large for months-old history (the stale case the flag catches)', () => {
    expect(daysSinceHistoryDate('2025-07-07', NOW)).toBeGreaterThan(STALENESS_FLAG_DAYS);
  });

  it('threshold is a positive integer; the flag fires at or beyond it, not below', () => {
    expect(Number.isInteger(STALENESS_FLAG_DAYS)).toBe(true);
    expect(STALENESS_FLAG_DAYS).toBeGreaterThan(0);
    expect(daysSinceHistoryDate('2026-05-31', NOW)).toBeGreaterThanOrEqual(STALENESS_FLAG_DAYS); // 14d
    expect(daysSinceHistoryDate('2026-06-01', NOW)).toBeLessThan(STALENESS_FLAG_DAYS); // 13d
  });
});

// Minimal MarketScore for the view/signal tests — only the fields these read.
function makeScore(over: {
  score?: number | null;
  timeToClearDays?: number | null;
  swingPct?: number | null;
  band?: 'steady' | 'moderate' | 'spiky' | null;
}): MarketScore {
  return {
    score: over.score ?? null,
    knownCount: 0,
    liquidity: { timeToClearDays: over.timeToClearDays ?? null },
    stability: { swingPct: over.swingPct ?? null },
    consistency: { band: over.band ?? null },
  } as unknown as MarketScore;
}

describe('signalValues', () => {
  it('phrases the liquidity clear time, rounding to whole days (plural aware)', () => {
    expect(signalValues(makeScore({ timeToClearDays: 1 })).liquidity).toBe('≈ 1 day to clear');
    expect(signalValues(makeScore({ timeToClearDays: 2.4 })).liquidity).toBe('≈ 2 days to clear');
    expect(signalValues(makeScore({ timeToClearDays: 0.3 })).liquidity).toBe('≈ <1 day to clear');
  });

  it('renders unknown signals honestly', () => {
    const v = signalValues(makeScore({}));
    expect(v).toEqual({ liquidity: 'clear time unknown', stability: 'swing unknown', demand: 'demand unknown' });
  });

  it('rounds the swing percent and maps the demand band word', () => {
    const v = signalValues(makeScore({ swingPct: 12.6, band: 'spiky' }));
    expect(v.stability).toBe('13%');
    expect(v.demand).toBe('spiky');
  });
});

describe('marketScoreView', () => {
  const day = 86_400_000;

  it('shows the score once seeded, and a placeholder before it settles', () => {
    expect(marketScoreView(makeScore({ score: 72 }), false, null, null).scoreDisplay).toBe('72');
    // Not seeded and score still null → the '…' placeholder, not '—'.
    expect(marketScoreView(makeScore({ score: null }), false, null, null).scoreDisplay).toBe('…');
    // Seeded with a genuinely-unknown score → the em dash.
    expect(marketScoreView(makeScore({ score: null }), true, null, null).scoreDisplay).toBe('—');
  });

  it('picks the breakdown heading by whether a score exists', () => {
    expect(marketScoreView(makeScore({ score: null }), true, null, null).breakdownHeading).toBe(
      'Market score — no history yet',
    );
    expect(marketScoreView(makeScore({ score: 50 }), true, null, null).breakdownHeading).toBe(
      'Score blends 3 live signals',
    );
  });

  it('never flags staleness before the client clock is read (nowMs null)', () => {
    const view = marketScoreView(makeScore({ score: 50 }), true, { latestDate: '2020-01-01' }, null);
    expect(view.staleAge).toBeNull();
    expect(view.staleNote).toBeNull();
  });

  it('flags staleness with an age label + note once the history is old enough', () => {
    // At exactly 14 days the age label buckets to weeks ('2w'); a 5-day-old
    // history under the threshold flags nothing (checked below).
    const now = STALENESS_FLAG_DAYS * day + Date.parse('2026-01-01T00:00:00Z');
    const view = marketScoreView(makeScore({ score: 50 }), true, { latestDate: '2026-01-01' }, now);
    expect(view.staleAge).toBe('2w');
    expect(view.staleNote).toEqual({ latestDate: '2026-01-01', age: '2w' });
  });

  it('does not flag fresh history under the threshold', () => {
    const now = 3 * day + Date.parse('2026-01-01T00:00:00Z');
    const view = marketScoreView(makeScore({ score: 50 }), true, { latestDate: '2026-01-01' }, now);
    expect(view.staleAge).toBeNull();
    expect(view.staleNote).toBeNull();
  });
})

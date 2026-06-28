'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { PopoverHeading, PopoverRow } from '@/components/ui/popover';
import type { MarketScore } from '@/data/industry-math/market-score';
import { daysSinceHistoryDate, STALENESS_FLAG_DAYS } from '../market-score-inputs';
import type { BlueprintStructure } from '../types';
import { KpiHead, KpiHelp, KpiTile, KPI_FIG } from './kpi-tile';
import { usePricing } from './PricingProvider';

// The Market Score KPI tile for the Cockpit — the "how sure can I sell this?"
// liquidity axis beside net margin's "how much?". Numbers are PLAIN and
// UNCOLORED (no tones, no confidence badge — that's a different, freshness-only
// system): a single 0–100 score, a time-to-clear glance, and a "?" badge whose
// hover reveals the full 3-signal breakdown.

function days(n: number): string {
  if (n < 1) return '<1 day';
  const r = Math.round(n);
  return `${r} day${r === 1 ? '' : 's'}`;
}

// Compact age label for the staleness flag (the /sites meta-strip idiom):
// days under a week, weeks under a month, months beyond.
function ageLabel(days: number): string {
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

const BAND_WORD = { steady: 'steady', moderate: 'moderate', spiky: 'spiky' } as const;

// The concrete value shown in parentheses for each signal row (the bit derived
// from the live score; the description beside it is fixed copy).
function signalValues(score: MarketScore): {
  liquidity: string;
  stability: string;
  demand: string;
} {
  return {
    liquidity:
      score.liquidity.timeToClearDays === null
        ? 'clear time unknown'
        : `≈ ${days(score.liquidity.timeToClearDays)} to clear`,
    stability:
      score.stability.swingPct === null ? 'swing unknown' : `${Math.round(score.stability.swingPct)}%`,
    demand: score.consistency.band === null ? 'demand unknown' : BAND_WORD[score.consistency.band],
  };
}

export function MarketScorePanel({ structure }: { structure: BlueprintStructure }) {
  const { marketScore, marketHistory, seeded } = usePricing();
  const history = marketHistory.get(structure.product.typeId) ?? null;
  const scoreText = marketScore.score === null ? '—' : String(marketScore.score);
  const value = signalValues(marketScore);

  // Staleness flag — a flag, never a score change (the composite stays keyed to
  // latestDate). The clock starts null so the static prerender of this Client
  // Component never reads the wall clock (Cache Components forbids Date.now() in
  // a prerendered Client Component — same constraint PriceFreshness handles); the
  // mount effect fills it in client-side, then a re-render reveals the flag.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    // The clock is read in a timer callback, never in the synchronous effect
    // body, so the static prerender never touches the wall clock and setState
    // stays out of the effect body (same posture as PriceFreshness). One read is
    // enough — staleness is coarse day buckets, and a reload refreshes the data.
    const id = setTimeout(() => setNowMs(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);
  const staleDays = nowMs === null ? null : daysSinceHistoryDate(history?.latestDate ?? null, nowMs);
  const staleAge =
    staleDays !== null && staleDays >= STALENESS_FLAG_DAYS ? ageLabel(staleDays) : null;

  const breakdown = (
    <>
      <PopoverHeading>
        {marketScore.score === null ? 'Market score — no history yet' : 'Score blends 3 live signals'}
      </PopoverHeading>
      <PopoverRow label="Liquidity">how fast a batch sells ({value.liquidity})</PopoverRow>
      <PopoverRow label="Price stability">recent swing in sell price ({value.stability})</PopoverRow>
      <PopoverRow label="Demand depth">buy volume vs. listed supply ({value.demand})</PopoverRow>
      {staleAge && history?.latestDate && (
        <p className="font-body text-[11px] leading-snug text-tone-orange">
          Latest trade {history.latestDate} ({staleAge} ago) — reflects that period, not today.
        </p>
      )}
    </>
  );

  return (
    <KpiTile>
      <KpiHead
        label="Market Score"
        right={<KpiHelp label="How the Market Score is calculated">{breakdown}</KpiHelp>}
      />
      <div className={cn(KPI_FIG, 'text-name')}>
        {seeded || marketScore.score !== null ? scoreText : '…'}
        <span className="ml-1 text-[13px] text-faint">/100</span>
      </div>
      {staleAge && (
        <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[9px] text-muted">
          <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-tone-orange" />
          history {staleAge} old
        </div>
      )}
    </KpiTile>
  );
}

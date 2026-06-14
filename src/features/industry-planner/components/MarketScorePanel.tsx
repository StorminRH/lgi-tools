'use client';

import { HoverPopover } from '@/components/ui/hover-popover';
import type { MarketHistoryInputs } from '@/data/market-history/types';
import type { MarketScore } from '@/data/industry-math/market-score';
import { formatQuantity } from '@/lib/format';
import { HISTORY_STABILITY_WINDOW_DAYS } from '@/data/market-history/constants';
import { SCORE_ADV_WINDOW_DAYS } from '../market-score-inputs';
import type { BlueprintStructure } from '../types';
import { usePricing } from './PricingProvider';

// The Market Score readout for the hero — the "how sure can I sell this?"
// liquidity axis beside net margin's "how much?". Numbers are PLAIN and
// UNCOLORED (no tones, no confidence badge — that's a different, freshness-only
// system): a single 0–100 score up top, then the concrete "why" as raw reworded
// values. The full per-input breakdown lives behind a hover affordance.

function days(n: number): string {
  if (n < 1) return '<1 day';
  const r = Math.round(n);
  return `${r} day${r === 1 ? '' : 's'}`;
}

const BAND_WORD = { steady: 'steady', moderate: 'moderate', spiky: 'spiky' } as const;

// One concise concrete readout per sub-signal for the glance line.
function glanceParts(score: MarketScore): string[] {
  const parts: string[] = [];
  parts.push(
    score.liquidity.timeToClearDays === null
      ? 'clear time unknown'
      : `≈${days(score.liquidity.timeToClearDays)} to clear`,
  );
  parts.push(
    score.stability.swingPct === null
      ? 'swing unknown'
      : `${Math.round(score.stability.swingPct)}% price swing`,
  );
  parts.push(score.consistency.band === null ? 'demand unknown' : `${BAND_WORD[score.consistency.band]} demand`);
  return parts;
}

// The per-input plain-language breakdown. Honest about every unknown and about
// what the score actually used (the 30-day window; the wall assumption).
// Each line carries a stable, unique key (its signal), so the list never relies
// on text content as a React key — two signals can't collide even if both read
// "unknown".
function breakdownLines(
  score: MarketScore,
  history: MarketHistoryInputs | null,
): { key: string; text: string }[] {
  const lines: { key: string; text: string }[] = [];
  const lq = score.liquidity;

  if (lq.timeToClearDays === null) {
    lines.push({ key: 'liquidity', text: 'Time to clear: unknown — no demand history yet.' });
  } else {
    const wall =
      lq.sellWallDays === null
        ? 'sell-side depth unknown, so this is a lower bound (your batch only)'
        : `≈${days(lq.sellWallDays)} of sell orders ahead of you + your ≈${days(lq.batchDays ?? 0)} batch`;
    lines.push({
      key: 'liquidity',
      text:
        `Time to clear ≈${days(lq.timeToClearDays)}: ${wall}, at ${SCORE_ADV_WINDOW_DAYS}-day average volume. ` +
        `Assumes you stay competitively listed; does not model price drift from undercutting.`,
    });
    if (lq.instantDumpUnits !== null) {
      lines.push({
        key: 'instant-dump',
        text: `Dump into buy orders now and ≈${formatQuantity(lq.instantDumpUnits)} units sell instantly.`,
      });
    }
  }

  lines.push({
    key: 'stability',
    text:
      score.stability.swingPct === null
        ? 'Price stability: unknown — needs at least two traded days.'
        : `Price stability: average price swung ${Math.round(score.stability.swingPct)}% over the last ${HISTORY_STABILITY_WINDOW_DAYS} days.`,
  });

  const covered =
    history && history.daysCovered > 0
      ? ` (traded ${history.daysCovered}/${HISTORY_STABILITY_WINDOW_DAYS} days)`
      : '';
  lines.push({
    key: 'consistency',
    text:
      score.consistency.band === null
        ? 'Demand consistency: unknown.'
        : `Demand consistency: ${BAND_WORD[score.consistency.band]}${covered}.`,
  });

  return lines;
}

// The context line: the other ADV windows, shown but NOT used by the score.
function contextLine(history: MarketHistoryInputs | null): string | null {
  if (!history) return null;
  const parts = history.averageDailyVolume
    .filter((w) => w.adv !== null)
    .map((w) => `${w.days}d ${formatQuantity(w.adv as number)}`);
  if (parts.length === 0) return null;
  return `Avg volume/day: ${parts.join(' · ')} (score uses ${SCORE_ADV_WINDOW_DAYS}d).`;
}

export function MarketScorePanel({ structure }: { structure: BlueprintStructure }) {
  const { marketScore, marketHistory, seeded } = usePricing();
  const history = marketHistory.get(structure.product.typeId) ?? null;
  const scoreText = marketScore.score === null ? '—' : String(marketScore.score);
  const ctx = contextLine(history);

  const breakdown = (
    <div className="flex flex-col gap-1.5 max-w-[320px]">
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted">
        {marketScore.score === null
          ? 'Market Score — no market history yet'
          : `Market Score ${marketScore.score} — based on ${marketScore.knownCount} of 3 signals`}
      </div>
      <ul className="flex flex-col gap-1 text-[11px] text-text leading-snug">
        {breakdownLines(marketScore, history).map(({ key, text }) => (
          <li key={key}>{text}</li>
        ))}
      </ul>
      {ctx && <div className="text-[10px] text-muted">{ctx}</div>}
      <div className="text-[10px] text-muted">
        Weakest-link scored — the lowest signal caps the total.
      </div>
    </div>
  );

  return (
    <div className="min-w-0">
      <HoverPopover
        label="Market Score breakdown"
        trigger={
          <div className="cursor-help">
            <div className="text-[9px] uppercase tracking-[0.16em] text-muted border-b border-dotted border-border-idle inline-block">
              Market Score
            </div>
            <div className="text-[22px] font-semibold leading-[1.15] text-name tabular-nums">
              {seeded || marketScore.score !== null ? scoreText : '…'}
            </div>
            <div className="text-[9px] text-muted mt-1 whitespace-nowrap">
              {glanceParts(marketScore).join(' · ')}
            </div>
          </div>
        }
      >
        {breakdown}
      </HoverPopover>
    </div>
  );
}

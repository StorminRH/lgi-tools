'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { marketScoreView } from '../market-score-inputs';
import type { BlueprintStructure } from '../types';
import { KpiHead, KpiHelp, KpiTile, KPI_FIG } from './kpi-tile';
import { useMarketData } from './planner-contexts';

// The Market Score KPI tile for the Cockpit — the "how sure can I sell this?"
// liquidity axis beside net margin's "how much?". Numbers are PLAIN and
// UNCOLORED (no tones, no confidence badge — that's a different, freshness-only
// system): a single 0–100 score, a time-to-clear glance, and a "?" badge whose
// hover reveals the full 3-signal breakdown. All the derived values come from
// the pure marketScoreView; this shell only holds the mount clock.

/** Renders market demand, spread, volume, and confidence signals derived by the market-score model. */
export function MarketScorePanel({ structure }: { structure: BlueprintStructure }) {
  const { marketScore, marketHistory, seeded } = useMarketData();

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

  const view = marketScoreView(marketScore, seeded, marketHistory.get(structure.product.typeId), nowMs);

  const breakdown = (
    <>
      <PopoverHeading>{view.breakdownHeading}</PopoverHeading>
      <PopoverRow label="Liquidity">how fast a batch sells ({view.signals.liquidity})</PopoverRow>
      <PopoverRow label="Price stability">recent swing in sell price ({view.signals.stability})</PopoverRow>
      <PopoverRow label="Demand depth">buy volume vs. listed supply ({view.signals.demand})</PopoverRow>
      {view.staleNote && (
        <p className="font-body text-body leading-snug text-tone-orange">
          Latest trade {view.staleNote.latestDate} ({view.staleNote.age} ago) — reflects that period, not
          today.
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
        {view.scoreDisplay}
        <span className="ml-1 text-ui text-faint">/100</span>
      </div>
      {view.staleAge && (
        <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-micro text-muted">
          <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-tone-orange" />
          history {view.staleAge} old
        </div>
      )}
    </KpiTile>
  );
}

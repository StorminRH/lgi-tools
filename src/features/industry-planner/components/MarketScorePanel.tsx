'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Dot } from '@/components/ui/dot';
import { PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { marketScoreView } from '../market-score-inputs';
import type { BlueprintStructure } from '../types';
import { KpiHead, KpiHelp, KpiTile, KPI_FIG } from './kpi-tile';
import { useMarketData } from './planner-contexts';

export function MarketScorePanel({ structure }: { structure: BlueprintStructure }) {
  const { marketScore, marketHistory, seeded } = useMarketData();

  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
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
        <p className="text-body leading-snug text-tone-orange">
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
          <Dot tone="orange" size="sm" />
          history {view.staleAge} old
        </div>
      )}
    </KpiTile>
  );
}

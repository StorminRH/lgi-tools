'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { formatIsk } from '@/lib/format/isk';
import { deriveLedger, selectNet, type MarginMode } from '../cockpit-margin';
import type { BlueprintStructure } from '../types';
import { usePricing } from './PricingProvider';

// The profit ledger strip: Cost · build-vs-buy bar · Sell · Profit. The cost
// basis follows the same gross/net choice as the KPI margin tile (net cost incl.
// the top-job install fee in net mode, raw input cost in gross). Profit is
// revenue − cost and is PRE-sell-fee, so it intentionally reads higher than the
// KPI net margin (which also nets out sell-side tax + broker fees).

// The cost-vs-profit bar. Both segments read one `--pct` (the cost fraction) set
// via the CSSOM after mount — never an inline width, which the production CSP
// would drop (same trick as <ProgressBar>).
function ProfitBar({ costPct }: { costPct: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${costPct}%`);
  }, [costPct]);
  return (
    <div ref={ref} className="profit-bar" aria-hidden>
      <span className="profit-bar-cost" />
      <span className="profit-bar-profit" />
    </div>
  );
}

function SegFig({
  label,
  value,
  valueClass,
  right,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  right?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-[3px]', right && 'text-right')}>
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <span className={cn('text-[15px] font-semibold tabular-nums', valueClass)}>{value}</span>
    </div>
  );
}

export function CockpitLedger({
  structure,
  marginMode,
}: {
  structure: BlueprintStructure;
  marginMode: MarginMode;
}) {
  const { pricing, location } = usePricing();
  const summary = pricing?.summary ?? null;
  const { net } = selectNet(pricing, structure.activityId, location !== null, marginMode);
  const { cost, revenue, profit, costPct } = deriveLedger(summary, net);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-[22px] rounded-md border border-border bg-section px-[18px] py-4">
      <SegFig
        label="Cost"
        value={cost !== null ? formatIsk(cost) : '—'}
        valueClass="text-name"
      />
      <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        <ProfitBar costPct={costPct} />
        <div className="flex justify-between text-[9px] text-muted">
          <span>build cost {costPct}%</span>
          <span className="text-isk">margin {100 - costPct}%</span>
        </div>
      </div>
      <SegFig
        label="Sell"
        value={revenue !== null ? formatIsk(revenue) : '—'}
        valueClass="text-isk"
        right
      />
      <SegFig
        label="Profit"
        value={profit !== null ? `${profit >= 0 ? '+' : ''}${formatIsk(profit)}` : '—'}
        valueClass={profit !== null && profit < 0 ? 'text-tone-red' : 'text-isk'}
        right
      />
    </div>
  );
}

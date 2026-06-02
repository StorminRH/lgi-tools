'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { priceFx } from '@/components/ui/price-fx';
import { TypeIcon } from '@/components/ui/type-icon';
import { activityLabel, marginToneClass } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { formatIsk, formatPct, formatQuantity } from '@/lib/format';
import { usePricing } from './PricingProvider';

// The sticky profitability hero — the "should I build this?" answer above the
// fold. Chrome (product shot, name, activity, subline) renders from the static
// structure; the margin, aggregate confidence, and cost/sell figures stream in
// from the pricing store and update as on-demand refreshes land. Until prices
// arrive it shows "Calculating…" and withholds the aggregate badge, mirroring
// the 3.1.1 cost panel's loading state.

function HeroStat({ label, value, fxClass }: { label: string; value: string; fxClass: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={cn('text-[13px] font-semibold text-isk whitespace-nowrap', fxClass)}>
        {value}
      </div>
    </div>
  );
}

export function BlueprintHero({ structure }: { structure: BlueprintStructure }) {
  const { pricing, seeded, aggregatePending } = usePricing();
  // Latches once the first confirmation cycle starts, so the settle pulse only
  // plays after a real shimmer — not on the initial paint.
  const [everPending, setEverPending] = useState(false);
  useEffect(() => {
    if (!aggregatePending) return;
    // Deferred set (0ms) to satisfy the set-state-in-effect lint, the same
    // escape the pricing clock used.
    const t = setTimeout(() => setEverPending(true), 0);
    return () => clearTimeout(t);
  }, [aggregatePending]);
  const fx = priceFx(aggregatePending, everPending);
  const summary = pricing?.summary ?? null;
  const margin = summary?.margin ?? null;
  const marginPct = summary?.marginPct ?? null;
  const sign = margin !== null && margin > 0 ? '+' : '';

  return (
    <div className="z-20 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-[1.5px] border-border bg-bg px-[18px] py-[14px] font-mono lg:sticky lg:top-0">
      <TypeIcon
        typeId={structure.product.typeId}
        variant="render"
        size={64}
        alt={structure.product.name}
        mono={structure.product.name.slice(0, 2)}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-display font-bold text-[20px] leading-[1.1] text-name">
            {structure.product.name}
          </span>
          <Pill tone="blue">{activityLabel(structure.activityId)}</Pill>
        </div>
        <div className="text-[11px] text-muted mt-1">
          Builds {formatQuantity(structure.product.quantityPerRun)} per run · margin before job fees
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-[0.16em] text-muted">Margin (before fees)</div>
        {summary === null ? (
          <div className="text-[22px] font-semibold text-muted leading-[1.15]">
            {seeded ? 'Pricing unavailable' : 'Calculating…'}
          </div>
        ) : (
          <>
            <div
              className={cn(
                'text-[22px] font-semibold leading-[1.15]',
                marginToneClass(marginPct),
                fx,
              )}
            >
              {sign}
              {formatIsk(margin)}
              {marginPct !== null && <span className="text-[14px] ml-2">({formatPct(marginPct)})</span>}
            </div>
            {summary.incomplete && (
              <div className="text-[9px] text-muted mt-1">
                Partial estimate — some prices unavailable.
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-5 flex-wrap">
        <HeroStat label="Input cost" value={summary ? formatIsk(summary.inputCost) : '—'} fxClass={fx} />
        <HeroStat label="Sell (Jita)" value={summary ? formatIsk(summary.revenue) : '—'} fxClass={fx} />
      </div>
    </div>
  );
}

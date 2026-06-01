'use client';

import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
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

// Hero ISK figure effect: while the live price is being confirmed the value
// fades and a soft light wave sweeps across it; once the live value lands it
// pulses a touch brighter, then holds solid in its tone. The classes live in
// globals.css (CSP-safe — keyframes, not inline style).
function priceFx(pending: boolean): string {
  return pending ? 'isk-fx-pending' : 'isk-fx-settle';
}

function HeroStat({ label, value, pending }: { label: string; value: string; pending: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={cn('text-[13px] font-semibold text-isk whitespace-nowrap', priceFx(pending))}>
        {value}
      </div>
    </div>
  );
}

export function BlueprintHero({ structure }: { structure: BlueprintStructure }) {
  const { pricing, seeded, aggregatePending } = usePricing();
  const summary = pricing?.summary ?? null;
  const margin = summary?.margin ?? null;
  const marginPct = summary?.marginPct ?? null;
  const sign = margin !== null && margin > 0 ? '+' : '';

  return (
    <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-[1.5px] border-border bg-bg px-[18px] py-[14px] font-mono">
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

      <div>
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
                priceFx(aggregatePending),
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

      <div className="flex gap-5">
        <HeroStat
          label="Input cost"
          value={summary ? formatIsk(summary.inputCost) : '—'}
          pending={aggregatePending}
        />
        <HeroStat
          label="Sell (Jita)"
          value={summary ? formatIsk(summary.revenue) : '—'}
          pending={aggregatePending}
        />
      </div>
    </div>
  );
}

'use client';

import { cn } from '@/components/ui/cn';
import { OdometerValue } from '@/components/ui/odometer-value';
import { Pill } from '@/components/ui/pill';
import { TypeIcon } from '@/components/ui/type-icon';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { activityLabel, marginToneClass } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { formatIsk, formatPct, formatQuantity } from '@/lib/format';
import { BuildLocationSelector } from './BuildLocationSelector';
import { usePricing } from './PricingProvider';

// The sticky profitability hero — the "should I build this?" answer above the
// fold. Chrome (product shot, name, activity, output units) renders from the
// static structure; the margin, aggregate confidence, and cost/sell figures
// stream in from the pricing store. Margin shows GROSS by default (materials
// only); once a build system is picked it flips to NET (after job install + sell
// fees) for manufacturing blueprints. Reactions stay gross-only for now.

function HeroStat({ label, value, pending }: { label: string; value: string; pending: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="text-[13px] font-semibold text-isk whitespace-nowrap">
        <OdometerValue value={value} pending={pending} />
      </div>
    </div>
  );
}

export function BlueprintHero({ structure }: { structure: BlueprintStructure }) {
  const { pricing, seeded, aggregatePending, runs, setRuns, location } = usePricing();
  const summary = pricing?.summary ?? null;

  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  // Net is shown only for a manufacturing blueprint with a build location picked
  // (assemblePricing returns net:null otherwise).
  const net = isManufacturing && location ? (pricing?.net ?? null) : null;
  const showNet = net !== null;

  const margin = showNet ? net.netMargin : (summary?.margin ?? null);
  const marginPct = showNet ? net.netMarginPct : (summary?.marginPct ?? null);
  const sign = margin !== null && margin > 0 ? '+' : '';

  const outputUnits = structure.product.quantityPerRun * runs;

  return (
    <div className="mb-4 border-[1.5px] border-border bg-bg font-mono">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-[18px] py-[14px]">
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
            Builds {formatQuantity(outputUnits)} unit{outputUnits === 1 ? '' : 's'} ·{' '}
            {runs} run{runs === 1 ? '' : 's'}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.16em] text-muted">
            {showNet ? 'Net margin (excl. sub-job fees)' : 'Gross margin'}
          </div>
          {summary === null ? (
            <div className="text-[22px] font-semibold text-muted leading-[1.15]">
              {seeded ? 'Pricing unavailable' : 'Calculating…'}
            </div>
          ) : (
            <>
              <div
                className={cn('text-[22px] font-semibold leading-[1.15]', marginToneClass(marginPct))}
              >
                <OdometerValue value={`${sign}${formatIsk(margin)}`} pending={aggregatePending} />
                {marginPct !== null && <span className="text-[14px] ml-2">({formatPct(marginPct)})</span>}
              </div>
              {showNet ? (
                net.jobFee.missingSystemCostIndex ? (
                  <div className="text-[9px] text-muted mt-1">
                    No cost index for {location?.systemName ?? 'this system'} — install fee incomplete.
                  </div>
                ) : (
                  <div className="text-[9px] text-muted mt-1">
                    Net of job install + sell fees · NPC station · ME 0.
                  </div>
                )
              ) : isManufacturing ? (
                <>
                  <div className="text-[9px] text-muted mt-1">
                    Materials only — not take-home. Pick a build system for net margin.
                  </div>
                  <div className="text-[9px] text-muted">Assumes NPC station, ME 0.</div>
                </>
              ) : (
                <div className="text-[9px] text-muted mt-1">
                  Net margin: manufacturing only for now.
                </div>
              )}
              {summary.incomplete && (
                <div className="text-[9px] text-muted">
                  Partial estimate — some prices unavailable.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-5 flex-wrap">
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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-[18px] py-[10px] border-t border-border">
        <label className="flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-muted">
          Runs
          <input
            type="number"
            min={1}
            step={1}
            value={runs}
            onChange={(e) => setRuns(e.target.valueAsNumber)}
            aria-label="Runs"
            className="w-[68px] font-mono text-[12px] px-2 py-1 bg-bg border border-border text-text focus:outline-none focus:border-border-active"
          />
        </label>
        {isManufacturing && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] uppercase tracking-[0.12em] text-muted">Build at</span>
            <BuildLocationSelector blueprintId={structure.blueprintTypeId} />
          </div>
        )}
      </div>
    </div>
  );
}
